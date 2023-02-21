import nock from "nock";

afterEach(function () {
  nock.restore();
  nock.cleanAll();
  nock.activate();
});
