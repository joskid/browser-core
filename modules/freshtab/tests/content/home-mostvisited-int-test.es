/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
  clone,
  expect,
  waitFor,
} from '../../core/test-helpers';
import {
  checkMessages,
  checkTelemetry,
  defaultConfig,
  generateHistoryResponse,
  Subject,
} from '../../core/test-helpers-freshtab';

describe('Freshtab interactions with most visited', function () {
  const dialSelector = '#section-most-visited a.dial';
  const deleteBtnSelector = 'button.delete';
  const undoBoxSelector = '.undo-notification-box';
  const areaSelector = '#section-most-visited';
  const historyResponse = generateHistoryResponse();

  let $initialDials;
  let $dialToDelete;
  let $2ndDialToDelete;
  let $deletedBtn;
  let subject;

  beforeEach(function () {
    subject = new Subject();
    subject.respondsWithEmptyTelemetry();
    subject.respondsWithEmptyNews();
    subject.respondsWithEmptyStats();

    const mostVisitedConfig = clone(defaultConfig);
    mostVisitedConfig.response.componentsState.historyDials.visible = true;
    subject.respondsWith(mostVisitedConfig);
  });

  context('when first two tiles have been deleted from a list of 3 elements', function () {
    let $2ndDeletedBtn;

    beforeEach(async function () {
      subject.respondsWith({
        module: 'freshtab',
        action: 'getSpeedDials',
        response: historyResponse[2],
      });

      subject.respondsWith({
        module: 'freshtab',
        action: 'checkForHistorySpeedDialsToRestore',
        response: true,
      });

      subject.respondsWith({
        module: 'freshtab',
        action: 'resetAllHistory',
        response: historyResponse[2],
      });

      await subject.load();

      $initialDials = subject.queryAll(dialSelector);
      $dialToDelete = $initialDials[0];
      $2ndDialToDelete = $initialDials[1];
      $deletedBtn = $dialToDelete.querySelector(deleteBtnSelector);
      $deletedBtn.click();
      await waitFor(() => (subject.query(undoBoxSelector)));

      $2ndDeletedBtn = $2ndDialToDelete
        .querySelector(deleteBtnSelector);
      $2ndDeletedBtn.click();
      return waitFor(() => (subject.query(undoBoxSelector)));
    });

    afterEach(function () {
      subject.unload();
    });

    describe('clicking on the "Restore all" button in settings panel', function () {
      const settingsButtonSelector = '#settings-btn';
      const settingsPanelSelector = '#settings-panel';
      const restoreBtnSelector = '#settings-panel .link';

      beforeEach(async function () {
        subject.query(settingsButtonSelector).click();
        await waitFor(() => subject.query(settingsPanelSelector));

        subject.startListening();
        subject.query(restoreBtnSelector).click();
        return waitFor(() => subject.queryAll(dialSelector).length === 3);
      });

      it('renders 3 most visited elements', function () {
        expect(subject.queryAll(dialSelector).length).to.equal(3);
      });

      it('changes the "Restore all" button state to inactive', function () {
        expect(subject.query(restoreBtnSelector).disabled).to.be.true;
      });

      checkMessages({
        messageName: 'resetAllHistory',
        subject: () => subject,
      });

      it('sends a "settings > restore_topsites > click" telemetry signal', function () {
        checkTelemetry({
          action: 'click',
          subject: () => subject,
          target: 'restore_topsites',
          type: 'home',
          view: 'settings',
        });
      });
    });
  });

  context('when most visited has just one element', function () {
    beforeEach(async function () {
      subject.respondsWith({
        module: 'freshtab',
        action: 'getSpeedDials',
        response: historyResponse[0],
      });

      await subject.load();
      $initialDials = subject.queryAll(dialSelector);
      $dialToDelete = $initialDials[0];
    });

    afterEach(function () {
      subject.unload();
    });

    describe('clicking on the element', function () {
      beforeEach(function () {
        subject.startListening();
        const logoSelector = '.logo';
        $dialToDelete.querySelector(logoSelector).click();
      });

      it('sends a "topsite > click" telemetry signal', function () {
        checkTelemetry({
          action: 'click',
          subject: () => subject,
          target: 'topsite',
          type: 'home',
        });
      });
    });

    describe('clicking on a delete button of the element', function () {
      beforeEach(function () {
        $deletedBtn = $dialToDelete.querySelector(deleteBtnSelector);

        subject.startListening();
        $deletedBtn.click();
        return waitFor(() => (subject.query(undoBoxSelector)));
      });

      describe('of the first element', function () {
        it('renders a popup with undo message', function () {
          expect(subject.query(undoBoxSelector)).to.exist;
        });

        it('still renders the most visited area', function () {
          expect(subject.query(areaSelector)).to.exist;
        });

        checkMessages({
          messageName: 'removeSpeedDial',
          subject: () => subject,
        });

        it('sends a "delete_topsite > click" telemetry signal', function () {
          checkTelemetry({
            action: 'click',
            subject: () => subject,
            target: 'delete_topsite',
            type: 'home',
          });
        });

        describe('then clicking on a close button of the undo popup', function () {
          const undoPopupCloseBtnSelector = '.undo-notification-box button.close';

          beforeEach(async function () {
            subject.query(undoPopupCloseBtnSelector).click();
            await waitFor(() => expect(subject.query(undoBoxSelector)).to.not.have.class('visible'), 500);
          });

          it('removes the popup', function () {
            expect(subject.query(undoBoxSelector)).to.not.have.class('visible');
          });

          it('sends a "notification > close > click" telemetry signal', function () {
            checkTelemetry({
              action: 'click',
              subject: () => subject,
              target: 'close',
              type: 'home',
              view: 'notification',
            });
          });
        });
      });
    });
  });
});
