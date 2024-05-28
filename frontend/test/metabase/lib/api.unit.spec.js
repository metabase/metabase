import fetchMock from "fetch-mock";

import api, { GET, POST, PUT } from "metabase/lib/api";
api.basename = "";

describe("api", () => {
  const successResponse = { body: { status: "ok" } };

  it("should GET", async () => {
    fetchMock.get("path:/hello", successResponse);
    const hello = GET("/hello");
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("GET should throw on 503 with no retry", async () => {
    fetchMock.get("path:/hello", 503);
    const hello = GET("/hello", { retry: false });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("should POST", async () => {
    fetchMock.post("path:/hello", successResponse);
    const hello = POST("/hello");
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("should PUT with remaining params as body", async () => {
    expect.assertions(1);
    fetchMock.put("path:/hello/123", async uri => {
      const body = await fetchMock.lastCall(uri).request.json();
      expect(body).toEqual({ other: "stuff" });
      return 200;
    });
    await PUT("/hello/:id")({ id: 123, other: "stuff" });
  });

  it("should PUT with a specific params as the body", async () => {
    expect.assertions(1);
    fetchMock.put("path:/hello/123", async uri => {
      const body = await fetchMock.lastCall(uri).request.json();
      expect(body).toEqual(["i", "am", "an", "array"]);
      return 200;
    });
    await PUT("/hello/:id")(
      { id: 123, notAnObject: ["i", "am", "an", "array"] },
      { bodyParamName: "notAnObject" },
    );
  });

  it("POST should throw on 503 with no retry", async () => {
    expect.assertions(1);
    fetchMock.post("path:/hello", 503);
    const hello = POST("/hello", { retry: false });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("GET should retry and succeed if 503 then 200", async () => {
    expect.assertions(1);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce(
      { url: "path:/hello", overwriteRoutes: false },
      successResponse,
    );
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
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    const limitedRetryGET = api._makeMethod("GET", RETRY_THREE_TIMES);
    const hello = limitedRetryGET("/hello", { retry: true });
    await expect(hello()).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("GET should succeed if the last attempt succeeds", async () => {
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce({ url: "path:/hello", overwriteRoutes: false }, 503);
    fetchMock.getOnce(
      { url: "path:/hello", overwriteRoutes: false },
      successResponse,
    );
    const limitedRetryGET = api._makeMethod("GET", RETRY_THREE_TIMES);
    const hello = limitedRetryGET("/hello", { retry: true });
    const response = await hello();
    expect(response).toEqual({ status: "ok" });
  });

  it("should use _status from body when HTTP status is 202", async () => {
    fetchMock.get("path:/async-status", {
      status: 202,
      body: {
        _status: 400,
        message: "error message",
      },
    });
    const asyncStatus = GET("/async-status");
    await expect(asyncStatus()).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        data: expect.objectContaining({ message: "error message" }),
      }),
    );
  });
});
