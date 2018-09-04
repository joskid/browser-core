import { window } from '../platform/globals';
import * as tabs from '../platform/tabs';

import {
  CliqzABTests,
  CliqzUtils,
  app,
  prefs,
  testServer,
  win,
} from '../tests/core/test-helpers';


function mockGlobalState() {
  // Disable core/ab-tests
  CliqzABTests.check = () => {};

  // Store all telemetry signals globally so that tests can use them
  win.allTelemetry = [];
  CliqzUtils.telemetry = (signal) => {
    win.allTelemetry.push(signal);
  };

  // We only need the tests for the regular cliqz dropdown
  prefs.set('dropDownABCGroup', 'cliqz');
  prefs.clear('dropDownStyle');
  app.services.pingCliqzResults = () => {};
}


const TEST_URL = window.location.href;


async function closeAllTabs() {
  await Promise.all((await tabs.query({}))
    .filter(({ url }) => url !== TEST_URL)
    .map(({ id, url }) =>
      // eslint-disable-next-line no-console
      tabs.closeTab(id).catch(ex => console.error('Could not close tab', id, url, ex))
    )
  );
}


(function start() {
  // Inject all tests
  Object.keys(window.TESTS).forEach((testName) => {
    const testFunction = window.TESTS[testName];
    testFunction();
  });

  // Keep track of original versions of mocked objects
  const abCheck = CliqzABTests.check;
  const fetchFactory = CliqzUtils.fetchFactory;
  const getSuggestions = CliqzUtils.getSuggestions;
  const historySearch = CliqzUtils.historySearch;
  const telemetry = CliqzUtils.telemetry;

  // Check with which frequency the extension should be restarted between tests
  const reloadExtensionCounterInc = Number(prefs.get('integration-tests.forceExtensionReload', 0));
  let reloadExtensionCounter = 0;

  beforeEach(async () => {
    await closeAllTabs();
    await testServer.reset();

    if (reloadExtensionCounterInc === 0) {
      mockGlobalState();
    } else if (win.preventRestarts) {
      mockGlobalState();
    } else {
      reloadExtensionCounter += reloadExtensionCounterInc;
      if (reloadExtensionCounter >= 1) {
        reloadExtensionCounter = 0;
        await app.extensionRestart(mockGlobalState);
      } else {
        mockGlobalState();
      }
    }
  });

  afterEach(async () => {
    CliqzUtils.telemetry = telemetry;
    CliqzUtils.fetchFactory = fetchFactory;
    CliqzUtils.getSuggestions = getSuggestions;
    CliqzUtils.historySearch = historySearch;
    CliqzABTests.check = abCheck;

    // Reset global state
    await closeAllTabs();
    await testServer.reset();
  });

  win.focus();
  mocha.run();
}());
