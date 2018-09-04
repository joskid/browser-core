import {
  blurUrlBar,
  checkMainResult,
  checkParent,
  checkSoccerLigaTable,
  $cliqzResults,
  fillIn,
  mockSearch,
  testsEnabled,
  waitFor,
  waitForPopup,
  win,
  withHistory,
} from './helpers';
import results from '../../core/integration/fixtures/resultsSoccerLigaTable';

export default function () {
  if (!testsEnabled()) { return; }

  context('for soccer liga table results', function () {
    before(function () {
      win.preventRestarts = true;
    });

    after(function () {
      win.preventRestarts = false;
    });

    context('(UI)', function () {
      before(async function () {
        blurUrlBar();
        await mockSearch({ results });
        withHistory([]);
        fillIn('bundesliga tabelle');
        await waitForPopup(2);
      });

      checkMainResult({ $result: $cliqzResults });
      checkParent({ $result: $cliqzResults, results });
      checkSoccerLigaTable({ $result: $cliqzResults, results });
    });

    context('(interactions) after clicking on the "Show more" button', function () {
      before(async function () {
        blurUrlBar();
        await mockSearch({ results });
        withHistory([]);
        fillIn('bundesliga tabelle');
        await waitForPopup(2);
        $cliqzResults.querySelector('.result.expand-btn').click();
        await waitFor(function () {
          return $cliqzResults.querySelectorAll('.table-row').length !== 6;
        });
      });

      checkMainResult({ $result: $cliqzResults });
      checkParent({ $result: $cliqzResults, results });
      checkSoccerLigaTable({ $result: $cliqzResults, results, isExpanded: true });
    });
  });
}
