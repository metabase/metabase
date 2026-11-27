const { leaveReactStuck, recordRun } = require("./react-helpers");

recordRun(__filename);

afterAll(() => {
  leaveReactStuck();
});

test("passes before its afterAll hook leaves React stuck", () => {});
