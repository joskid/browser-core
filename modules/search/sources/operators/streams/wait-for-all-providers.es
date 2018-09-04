import Rx from '../../../platform/lib/rxjs';

const { filter } = Rx.operators;

const shouldIgnore = (name, config) =>
  // 'rich-header' is a non-stand-alone provider, it's only queried from 'cliqz'
  name === 'rich-header' ||
  // ignore 'querySuggestions' if it is disabled
  (name === 'querySuggestions' && !config.providers.querySuggestions.isEnabled);

/**
 * Factory for the `waitForAllProviders` operator, which ensures that results
 * are only emitted once all providers are done (if this operator is enabled
 * via config). Note that the slowest provider will determine when results
 * are shown.
 *
 * @function waitForAllProviders
 * @param {Object} result - The result all available responses.
 */
export default config => filter(({ responses }) => {
  const { isEnabled } = config.operators.streams.waitForAllProviders;

  if (!isEnabled) {
    return true;
  }

  // TODO: copied from `smoothResults`
  const providerNames = Object.keys(config.providers)
    .sort((a, b) => config.providers[a].order - config.providers[b].order);

  const allDone = providerNames
    .filter(name => !shouldIgnore(name, config))
    .map(name => responses.find(response => response.provider === name))
    .every(response => response && response.state === 'done');

  return allDone;
});
