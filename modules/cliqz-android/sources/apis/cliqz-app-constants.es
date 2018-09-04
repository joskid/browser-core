/* globals ChromeUtils, ExtensionAPI, AppConstants */
ChromeUtils.import('resource://gre/modules/AppConstants.jsm');

this.cliqzAppConstants = class extends ExtensionAPI {
  getAPI() {
    return {
      cliqzAppConstants: {
        get: key => AppConstants[key]
      }
    };
  }
};
