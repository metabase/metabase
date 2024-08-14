import { captureConsoleErrors, MAX_ERROR_LOGS } from "./console";

describe("captureConsolErrors", () => {
  beforeEach(() => {
    captureConsoleErrors();
  });

  afterEach(() => {
    console.errorBuffer = [];
  });

  // these have to be one test because if they run in parallel
  // they interfere with each other 😢
  it(`should create an error buffer that keeps a maximum of ${MAX_ERROR_LOGS} records`, () => {
    expect(console.errorBuffer).toEqual([]);

    console.error("test error 1");
    expect(console.errorBuffer).toEqual([["test error 1"]]);

    for (let i = 2; i <= MAX_ERROR_LOGS + 5; i++) {
      console.error(`test error ${i}`);
    }
    expect(console.errorBuffer.length).toEqual(MAX_ERROR_LOGS);

    expect(console.errorBuffer[0]).toEqual([
      `test error ${MAX_ERROR_LOGS + 5}`,
    ]);
    expect(console.errorBuffer[MAX_ERROR_LOGS - 1]).toEqual([`test error 6`]);
  });
});
