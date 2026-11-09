test("passes when done is called", (done) => {
  setTimeout(done, 1);
});
test("fails when done gets an error", (done) => {
  done(new Error("done error"));
});
test("fails when it takes done and returns a promise", async (done) => {
  done();
});
describe("a beforeEach that takes done", () => {
  beforeEach((done) => {
    setTimeout(done, 1);
  });
  test("passes", () => {});
});
// Last, because a timeout ends the worker's run of the file.
test("fails when done is never called", (done) => {}, 25);
