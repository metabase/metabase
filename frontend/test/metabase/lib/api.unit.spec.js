import nock from "nock";
import api, { GET, POST, PUT } from "metabase/lib/api";
api.basename = "";

describe("api", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const successResponse = { status: "ok" };

  it("should GET", async () => {
    nock(location.origin).get("/hello").reply(200, successResponse);
    const hello = GET("/hello");
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("GET should throw on 503 with no retry", async () => {
    nock(location.origin).get("/hello").reply(503);
    const hello = GET("/hello", { retry: false });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("should POST", async () => {
    nock(location.origin).post("/hello").reply(200, successResponse);
    const hello = POST("/hello");
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("should PUT with remaining params as body", async () => {
    expect.assertions(1);
    nock(location.origin)
      .put("/hello/123")
      .reply(201, (uri, body) => {
        expect(body).toEqual({ other: "stuff" });
      });
    await PUT("/hello/:id")({ id: 123, other: "stuff" });
  });

  it("should PUT with a specific params as the body", async () => {
    expect.assertions(1);
    nock(location.origin)
      .put("/hello/123")
      .reply(201, (uri, body) => {
        expect(body).toEqual(["i", "am", "an", "array"]);
      });
    await PUT("/hello/:id")(
      { id: 123, notAnObject: ["i", "am", "an", "array"] },
      { bodyParamName: "notAnObject" },
    );
  });

  it("POST should throw on 503 with no retry", async () => {
    expect.assertions(1);
    nock(location.origin).post("/hello").reply(503);
    const hello = POST("/hello", { retry: false });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("GET should retry and succeed if 503 then 200", async () => {
    expect.assertions(1);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(200, successResponse);
    const hello = GET("/hello", { retry: true });
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  const RETRY_THREE_TIMES = {
    retryCount: 3,
    retryDelayIntervals: [1, 1, 1],
  };

  it("GET should fail if after retryCount it still returns 503", async () => {
    expect.assertions(1);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(503);
    const limitedRetryGET = api._makeMethod("GET", RETRY_THREE_TIMES);
    const hello = limitedRetryGET("/hello", { retry: true });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("GET should succeed if the last attempt succeeds", async () => {
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(503);
    nock(location.origin).get("/hello").reply(200, successResponse);
    const limitedRetryGET = api._makeMethod("GET", RETRY_THREE_TIMES);
    const hello = limitedRetryGET("/hello", { retry: true });
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("should use _status from body when HTTP status is 202", async () => {
    nock(location.origin)
      .get("/async-status")
      .reply(202, { _status: 400, message: "error message" });
    const asyncStatus = GET("/async-status");
    await expect(asyncStatus()).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        data: expect.objectContaining({ message: "error message" }),
      }),
    );
  });
});
