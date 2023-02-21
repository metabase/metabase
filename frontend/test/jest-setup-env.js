import nock from "nock";

afterEach(function () {
  nock.restore();
  nock.abortPendingRequests();
  nock.cleanAll();
  nock.enableNetConnect();
  nock.emitter.removeAllListeners();
  nock.activate();
});
