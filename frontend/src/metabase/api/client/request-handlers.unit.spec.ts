import { resetPluginSlots } from "metabase/plugin-slots";

import { PLUGIN_API } from "../plugins";

import type { OnBeforeRequestHandlerConfig } from "./middleware";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

const runEmbeddedHeaderHandler = () =>
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST);

describe("setEmbeddedHeader", () => {
  afterEach(() => {
    delete window.overrideIsWithinIframe;
    resetPluginSlots();
  });

  it("should tag the request as embedded when the page is inside an iframe", async () => {
    window.overrideIsWithinIframe = true;

    expect(await runEmbeddedHeaderHandler()).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });
  });

  it("should not tag the request when the page is not inside an iframe", async () => {
    expect(await runEmbeddedHeaderHandler()).toBeUndefined();
  });

  it("should tag the request again after the request handlers are reinitialized", async () => {
    window.overrideIsWithinIframe = true;
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader = async () => {};

    expect(await runEmbeddedHeaderHandler()).toBeUndefined();

    resetPluginSlots();

    expect(await runEmbeddedHeaderHandler()).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });
  });
});
