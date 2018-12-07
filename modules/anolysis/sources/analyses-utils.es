/**
 * This file is meant to contain re-usable code related analyses. You can think
 * of it as a toolbox containing building blocks that can be used for aggregated
 * metrics.
 */

/**
 * Given a histogram which keys are indices (contiguous integers), creates an
 * array histogram where indices are the keys, and values are the counts
 * (defaulting to zero).
 *
 * e.g.:
 * >>> indexHistogramToArray(new Counter([1, 1, 2, 2, 2, 3, 1]))
 * [0, 3, 3, 1]
 */
export function indicesHistogramToArray(counter) {
  const array = [];
  const maximumIndex = Math.max(...counter.keys());
  for (let i = 0; i <= maximumIndex; i += 1) {
    array.push(counter.get(i));
  }
  return array;
}

/**
 * To be used together with core/kord/inject
 * Calling an action of disabled or missing module
 * results in promise rejects. This helper function
 * generates a promise error callback that will
 * resolve to fixed value in those cases.
 *
 * Example:
 *
 *   inject.module('freshtab').action('getConfig')
 *     .catch(actionFallback({}));
 */
export const actionFallback = fallbackValue => (error) => {
  if (
    error
    && (
      error.name === 'ModuleDisabledError'
      || error.name === 'ModuleMissingError'
    )
  ) {
    return fallbackValue;
  }
  throw error;
};
