/* global chai */
/* global describeModule */
/* global require */
/* eslint-disable func-names */

const prefs = {};
const actionValue = 'offer_added'; // should be real one

export default describeModule('offers-v2/signals/utils',
  () => ({
    '../offers/action-defs': {
      default: {},
    },
    '../offers_configs': {
      default: {},
    },
    'core/prefs': {
      default: {
        get: function (k, v) {
          return prefs[k] || v;
        },
        getObject: function(k) {
          return k;
        }
      }
    },
    'core/config': {
      default: {
      }
    },
  }),
  () => {
    describe('addOrCreate function', () => {
      let addOrCreate;

      beforeEach(function () {
        addOrCreate = this.module().addOrCreate;
      });

      it('check against new field', () => {
        const d = {};
        addOrCreate(d, 'field', 5);
        chai.expect(d.field).to.be.eql(5);
      });

      it('check against existing field', () => {
        const d = {field: 7};
        addOrCreate(d, 'field', 5);
        chai.expect(d.field).to.eql(12);
      });
    });

    describe('constructSignal function', () => {
      let constructSignal;
      const _data = (k, v) => ({c_data: {offers: [{offer_data: [{origin_data: {[k]: v}}]}]}});
      const _getData = (d) => d.payload.data.c_data.offers[0].offer_data[0].origin_data;

      beforeEach(function () {
        constructSignal = this.module().constructSignal;
      });

      afterEach(function () {
        constructSignal = null;
      })

      it('check against expected signals', () => {
        const d = constructSignal('1', '1', _data(actionValue, 2));
        chai.expect(_getData(d)).to.eql({[actionValue]: 2});
      });

      it('check against expected repeated signals', () => {
        const k = `repeated_${actionValue}`;
        const d = constructSignal('1', '1', _data(k, 2));
        chai.expect(_getData(d)).to.eql({[k]: 2});
      });

      it('check against unexpected signals', () => {
        const k = 'offers_unexpected_signal_bar';
        const d = constructSignal('1', '1', _data('bar', 2));
        chai.expect(_getData(d)).to.deep.eql({[k]: 2, bar: 2});
      });

      it('check against unexpected repeated signals', () => {
        const k = 'offers_unexpected_signal_repeated_bar';
        const k2 = 'repeated_bar';
        const d = constructSignal('1', '1', _data(k2, 2));
        chai.expect(_getData(d)).to.deep.eql({[k2]: 2, [k]: 2});
      });

      it('check against already existing unexpected signals', () => {
        const k = 'offers_unexpected_signal_foo';
        const d = constructSignal('1', '1', _data(k, 2));
        chai.expect(_getData(d)).to.deep.eql({[k]: 2});
      });
    });
  });
