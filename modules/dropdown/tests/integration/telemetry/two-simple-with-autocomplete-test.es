import {
  blurUrlBar,
  CliqzUtils,
  expect,
  testsEnabled,
  fillIn,
  press,
  respondWith,
  release,
  waitFor,
  withHistory } from '../helpers';
import { results } from '../../../core/integration/fixtures/resultsTwoSimple';

export default function () {
  if (!testsEnabled()) { return; }

  describe('generates correct telemetry signals for an autocompleted result', function () {
    const win = CliqzUtils.getWindow();
    const urlBar = win.CLIQZ.Core.urlbar;
    const enterSignalFields = [
      { name: 'current_position', type: 'number', expValue: 0 },
      { name: 'display_time', type: 'number' },
      { name: 'local_source', type: 'string', expValue: '' },
      { name: 'new_tab', type: 'boolean' },
      { name: 'position_type', type: 'object', resultLength: 1 },
      { name: 'query_length', type: 'number', expValue: 2 },
      { name: 'reaction_time', type: 'number' },
      { name: 'result_order', type: 'object', resultLength: 2 },
      { name: 'search', type: 'boolean', expValue: false },
      { name: 'v', type: 'number' },
      { name: 'source', type: 'object' },
      { name: 'autocompleted', type: 'boolean', expValue: true },
      { name: 'autocompleted_length', type: 'number', expValue: 26 },
    ];
    let resultSignals;
    let resultSignalCount;
    let urlClicked;
    let handleCommandWhere;

    beforeEach(function () {
      urlClicked = false;
      handleCommandWhere = '';

      blurUrlBar();

      // clear telemetry
      win.allTelemetry = [];

      // mock firefox function to open links (used for same tab)
      win.CLIQZ.Core.urlbar._handleCommand = win.CLIQZ.Core.urlbar.handleCommand;
      win.CLIQZ.Core.urlbar.handleCommand = function (_, where) {
        urlClicked = true;
        // we expect handleCommand to be called only for current tabs
        handleCommandWhere = where === 'current' ? 'current' : 'err';
      };

      // mock cliqz function to open links (used for new tab)
      win.CliqzUtils._openLink = win.CliqzUtils.openLink;
      win.CliqzUtils.openLink = function (_win, _url, newTab) {
        urlClicked = true;
        // we expect openLink to be called only for new tabs
        handleCommandWhere = newTab === true ? 'tab' : 'err';
      };

      withHistory([]);
      respondWith({ results });
      fillIn('ro');
      return waitFor(function () {
        // wait for autocomplete
        return urlBar.textValue === 'royalgames.com';
      });
    });

    afterEach(function () {
      win.CLIQZ.Core.urlbar.handleCommand = win.CLIQZ.Core.urlbar._handleCommand;
      delete win.CLIQZ.Core.urlbar._handleCommand;
      win.CliqzUtils.openLink = win.CliqzUtils._openLink;
      delete win.CliqzUtils._openLink;
      release({ key: 'Control', code: 'ControlLeft' });
      release({ key: 'Shift', code: 'ShiftLeft' });
    });

    [
      { name: 'Enter and Ctrl keys', press: { key: 'Enter', ctrlKey: true } },
      { name: 'Enter key', press: { key: 'Enter' } }
    ].forEach(function (pressedKeys) {
      xcontext(`after pressing ${pressedKeys.name}`, function () {
        beforeEach(function () {
          press(pressedKeys.press);
          // check the boolean to make sure the function opening new links
          // has executed and finished
          return waitFor(function () {
            return urlClicked;
          })
            .then(function () {
              resultSignals = win.allTelemetry.filter(function (s) {
                return ((s.type === 'activity') && (s.action === 'result_enter'));
              });
              resultSignalCount = resultSignals.length;
            });
        });

        describe('sends an "activity > result_enter" signal', function () {
          it('only once and with correct amount of fields', function () {
            expect(resultSignalCount).to.equal(1);
            if (pressedKeys.press.ctrlKey) {
              expect(handleCommandWhere).to.equal('tab');
            } else {
              expect(handleCommandWhere).to.equal('current');
            }
            resultSignals.forEach(function (signal) {
              // add 2 to length for 'activity' and 'result_click'
              expect(Object.keys(signal).length).to.equal(enterSignalFields.length + 2);
            });
          });

          enterSignalFields.forEach(function (field) {
            it(`with an existing "${field.name}" field containing correct value(s)`, function () {
              resultSignals.forEach(function (signal) {
                expect(resultSignalCount).to.be.above(0);
                expect(signal[field.name]).to.exist;
                expect(typeof signal[field.name]).to.equal(field.type);

                if (field.expValue !== undefined) {
                  expect(signal[field.name]).to.equal(field.expValue);
                }

                if (field.resultLength !== undefined) {
                  expect(signal[field.name].length).to.equal(field.resultLength);
                }
              });
            });
          });
        });
      });
    });
  });
}
