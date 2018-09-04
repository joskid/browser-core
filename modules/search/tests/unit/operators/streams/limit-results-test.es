const { resultsBeforeLimit } = require('./limit-results-fixture');

const Rx = require('rxjs');

const mock = {
  'search/operators/normalize': {
    getMainLink: ({ links }) => links[0],
  },
  'platform/lib/rxjs': {
    default: Rx,
  }
};

export default describeModule('search/operators/streams/limit-results',
  () => mock,
  () => {
    describe('#limit-results', function() {
      let limit;
      const nLimitResults = 5;

      beforeEach(function() {
        limit = this.module().limitHistoryResults;
      });

      it('limit empty results', function () {
        const results = [];
        chai.expect(limit(results, nLimitResults)).to.be.empty;
      });

      it('limit result with empty links', function () {
        const results = [{ links: [] }];
        chai.expect(limit(results, nLimitResults)).to.deep.equal([{ links: [] }]);
      });

      it('limit number of 1st history results in cluster correctly', function() {
        const limitedResults = limit(resultsBeforeLimit, nLimitResults);
        const nHistoryLinks = limitedResults[0].links.filter(link => ['history', 'main'].includes(link.meta.type)).length
        chai.expect(nHistoryLinks).to.equal(3);
      });

      it('limit number of 2nd history results in cluster correctly', function() {
        const limitedResults = limit(resultsBeforeLimit, nLimitResults);
        const nHistoryLinks = limitedResults[1].links.filter(link => ['history', 'main'].includes(link.meta.type)).length
        chai.expect(nHistoryLinks).to.equal(1);
      });

      it('limit number of 3rd history results in cluster correctly', function() {
        const limitedResults = limit(resultsBeforeLimit, nLimitResults);
        const nHistoryLinks = limitedResults[2].links.filter(link => ['history', 'main'].includes(link.meta.type)).length
        chai.expect(nHistoryLinks).to.equal(1);
      });

      it('limit number of total history results in cluster correctly', function() {
        const limitedResults = limit(resultsBeforeLimit, nLimitResults);
        const nHistoryLinks = limitedResults
          .map(result => result.links.filter(link => ['history', 'main'].includes(link.meta.type)).length)
          .reduce((sum, el) => sum + el, 0);
        chai.expect(nHistoryLinks).to.equal(5);
      });
    });
  }
);
