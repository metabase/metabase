import nock from "nock";

/* Usage:

describe('my tests', () => {
  const apiMock = setupServerMocks();

  it('should do something', async () => {
    apiMock.get('/api/something').reply(200, { data: 'something' });

    render(
      <MyComponent />
    );

    expect(await screen.findByText('something')).toBeInTheDocument();
  });

  it('should do something else', async () => {
    apiMock.get('/api/something-else').reply(200, { data: 'something else' });

    render(
      <MyOtherComponent />
    );

    expect(await screen.findByText('something else')).toBeInTheDocument();
  });
});

*/

export function createScope() {
  return nock(location.origin);
}

/**
 * setupServerMocks creates a nock scope and cleans it up after the test block.
 * @returns {nock.Scope} A nock scope that is cleaned up after each test
 */
export function setupServerMocks() {
  afterAll(() => {
    nock.cleanAll();
  });

  return createScope();
}
