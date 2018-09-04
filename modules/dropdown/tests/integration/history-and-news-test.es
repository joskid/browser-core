import {
  $cliqzResults,
  blurUrlBar,
  checkhistoryResult,
  fillIn,
  mockSearch,
  testsEnabled,
  waitForPopup,
  win,
  withHistory,
} from './helpers';
import results from '../../core/integration/fixtures/resultsHistoryAndNews';
import historyResults from '../../core/integration/fixtures/historyResultsHistoryAndNews';

export default function () {
  if (!testsEnabled()) { return; }

  context('for history and news rich header', function () {
    before(async function () {
      win.preventRestarts = true;
      blurUrlBar();
      await mockSearch({ results });
      withHistory(historyResults);
      fillIn('cliqz');
      await waitForPopup(4);
    });

    after(function () {
      win.preventRestarts = false;
    });

    checkhistoryResult({
      $result: $cliqzResults,
      historyResults,
      isPresent: true
    });
  });
}
