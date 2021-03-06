/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { httpHandler } from '../core/http';

export const LOCALE_PATH = '/_locales';
export const SUPPORTED_LANGS = ['de', 'en', 'fr'];
export const IMPLEMENTS_GET_MESSAGE = false;
export const locale = {};

function load(url) {
  // Warning - sync request
  return JSON.parse(httpHandler('GET', url, null, null, null, null, true).response);
}

export const loadTranslation = (lang) => {
  const url = `${LOCALE_PATH}/${lang}/messages.json`;
  // Warning - sync request
  const localeObject = load(url);
  locale[lang] = localeObject;
};

export function getMessage() {}
