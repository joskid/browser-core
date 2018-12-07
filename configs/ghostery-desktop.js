/* eslint-disable */

'use strict';

const base = require('./common/system');
const urls = require('./common/urls-ghostery');

module.exports = {
  "platform": "firefox",
  "baseURL": "resource://cliqz/",
  "testsBasePath": "./build/ghostery@cliqz.com/chrome/content",
  "testem_launchers": ["unit-node", "Chrome"],
  "testem_launchers_ci": ["unit-node"],
  "pack": "cd build && fab package:version=$VERSION,cert_path=$CLIQZ_CERT_PATH,cert_pass_path=$CLIQZ_CERT_PASS_PATH",
  "publish": "cd build && fab publish:beta=$CLIQZ_BETA,channel=$CLIQZ_CHANNEL,pre=$CLIQZ_PRE_RELEASE,version=$VERSION,cert_path=$CLIQZ_CERT_PATH,cert_pass_path=$CLIQZ_CERT_PASS_PATH",
  "updateURL": "https://s3.amazonaws.com/cdncliqz/update/browser/latest.rdf",
  "updateURLbeta": "https://s3.amazonaws.com/cdncliqz/update/browser_beta/latest.rdf",
  "settings": Object.assign({}, urls, {
    "id": "ghostery@cliqz.com",
    "name": "Ghostery",
    "channel": "GB00",
    "homepageURL": "https://ghostery.com/",
    "freshTabNews": true,
    "freshTabStats": false,
    "showDataCollectionMessage": false,
    "helpMenus": true,
    "showNewBrandAlert": true,
    "suggestions": false,
    "onBoardingVersion": "3.0",
    "HW_CHANNEL": "ghostery-browser",
    "OFFERS_CHANNEL": "ghostery",
    "NEW_TAB_URL": "resource://cliqz/freshtab/home.html",
    "ONBOARDING_URL": "resource://cliqz/onboarding-v3/index.html",
    "HISTORY_URL": "resource://cliqz/cliqz-history/index.html#/",
    "modules.history.search-path": "?query=",
    "ICONS": {
      "active": {
        "default": "control-center/images/cc-active.svg",
        "dark": "control-center/images/cc-active-dark.svg"
      },
      "inactive": {
        "default": "control-center/images/cc-critical.svg",
        "dark": "control-center/images/cc-critical-dark.svg"
      },
      "critical": {
        "default": "control-center/images/cc-critical.svg",
        "dark": "control-center/images/cc-critical-dark.svg"
      }
    },
    "PAGE_ACTION_ICONS": {
      "default": "control-center/images/page-action-dark.svg",
      "light": "control-center/images/page-action-dark.svg",
      "dark": "control-center/images/page-action-light.svg"
    },
    "BACKGROUNDS": {
      "active": "#471647",
      "critical": "#471647"
    },
    "ATTRACK_TELEMETRY_PROVIDER": "hpnv2",
    "ALLOWED_COUNTRY_CODES": ["de", "at", "ch", "es", "us", "fr", "nl", "gb", "it", "se"],
    "antitrackingPlaceholder": ".com/tracking",
    "antitrackingHeader": "CLIQZ-AntiTracking",
    "FRESHTAB_TITLE": 'Ghostery Tab',
  }),
  "default_prefs" : {
    "modules.context-search.enabled": false,
    "modules.history.enabled": false,
    "modules.type-filter.enabled": false,
    "modules.antitracking-blocker.enabled": false,
    "modules.history-analyzer.enabled": false,
    "proxyPeer": false,
    "proxyTrackers": false,
    "modules.cookie-monster.enabled": true,
    "suggestionChoice": 2,
    'freshtab.search.mode': 'search',
  },
  "modules": [
    "core",
    "core-cliqz",
    "dropdown",
    "firefox-specific",
    "static",
    "geolocation",
    "ui",
    "last-query",
    "human-web",
    "context-menu",
    "freshtab",
    "webrequest-pipeline",
    "performance",
    "hpnv2",
    "control-center",
    "offers-v2",
    "popup-notification",
    "history-analyzer",
    "offers-debug",
    "browser-panel",
    "message-center",
    "offboarding",
    "anolysis",
    "anolysis-cc",
    "abtests",
    "context-search",
    "privacy-dashboard",
    "https-everywhere",
    "onboarding-v3",
    "type-filter",
    "history",
    "offers-cc",
    "video-downloader",
    "market-analysis",
    "p2p",
    "proxyPeer",
    "pairing",
    "antitracking-blocker",
    "search",
    "cookie-monster",
    "privacy",
    "inter-ext-messaging",
    "privacy-migration",
    "myoffrz-helper"
  ],
  systemDefault: base.systemConfig,
  builderDefault: base.builderConfig,
  bundleConfigs: Object.assign({}, base.appBundleConfig),
};
