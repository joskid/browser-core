/* global chai, describeModule */

const Rx = require('rxjs');
const rxSandbox = require('rx-sandbox').rxSandbox;


const mock = {
  'platform/lib/rxjs': {
    default: Rx,
  },
  'search/operators/responses/utils': {
    hasResults: ({ hasResults } = {}) => hasResults,
    isDone: ({ isDone } = {}) => isDone,
  },
  'search/operators/responses/smooth-clusters': {
    default: (oldRespnse, newResponse) => newResponse,
  },
  'search/operators/responses/smooth-responses': {
    default: (oldRespnse, newResponse) => newResponse,
  },
};

export default describeModule('search/operators/streams/smooth-results',
  () => mock,
  () => {
    describe('#smoothResults', function () {
      let smoothResults;
      let sandbox;
      const config = {
        providers: {
          providerA: {
            order: 1,
          },
          providerB: {
            order: 0,
          },
        },
        operators: {
          streams: {
            smoothResults: {
              isEnabled: true,
            },
          },
        },
      };

      beforeEach(function () {
        sandbox = rxSandbox.create();
        smoothResults = this.module().default;
      });

      it('handles empty result', function () {
        const source$ = sandbox.hot('-i', {
          i: {
            query: {},
            responses: [],
          },
        });
        const expected = sandbox.e('-o', {
          o: {
            query: {},
            responses: [],
          }
        });

        const messages = sandbox.getMessages(source$.let(smoothResults(config)));
        sandbox.flush();

        return chai.expect(messages).to.deep.equal(expected);
      });

      it('sorts current result', function () {
        const source$ = sandbox.hot('-i', {
          i: {
            query: {},
            responses: [
              { provider: 'providerA', isDone: true },
              { provider: 'providerB', isDone: true },
            ],
          },
        });
        const expected = sandbox.e('-o', {
          o: {
            query: {},
            responses: [
              { provider: 'providerB', isDone: true },
              { provider: 'providerA', isDone: true },
            ],
          }
        });

        const messages = sandbox.getMessages(source$.let(smoothResults(config)));
        sandbox.flush();

        return chai.expect(messages).to.deep.equal(expected);
      });

      it('progressively updates responses', function () {
        const source$ = sandbox.hot('-ij', {
          i: {
            query: { query: 'a' },
            responses: [
              { provider: 'providerA', results: ['A_a'], isDone: true },
              { provider: 'providerB', results: ['B_a'], isDone: true },
            ],
          },
          j: {
            query: { query: 'b' },
            responses: [
              { provider: 'providerB', results: ['B_b'], isDone: true },
              { provider: 'providerA', results: [], isDone: false },
            ],
          },
        });
        const expected = sandbox.e('-ol', {
          o: {
            query: { query: 'a' },
            responses: [
              { provider: 'providerB', results: ['B_a'], isDone: true },
              { provider: 'providerA', results: ['A_a'], isDone: true },
            ],
          },
          l: {
            query: { query: 'b' },
            responses: [
              { provider: 'providerB', results: ['B_b'], isDone: true },
              { provider: 'providerA', results: ['A_a'], isDone: true },
            ],
          }
        });

        const messages = sandbox.getMessages(source$.let(smoothResults(config)));
        sandbox.flush();

        return chai.expect(messages).to.deep.equal(expected);
      });
    });
  },
);
