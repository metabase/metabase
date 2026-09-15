import { resetPluginSlots } from "metabase/plugins/slot";

import { PLUGIN_API } from "../plugins";

import type { OnBeforeRequestHandlerConfig } from "./middleware";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

describe("setEmbeddedHeader", () => {
  afterEach(() => {
    delete window.overrideIsWithinIframe;
    resetPluginSlots();
  });

  it("adds the embedded header inside an iframe", async () => {
    window.overrideIsWithinIframe = true;

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });
  });

  it("omits the embedded header outside an iframe", async () => {
    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toBeUndefined();
  });

  it("restores the embedded header handler after reinitialization", async () => {
    window.overrideIsWithinIframe = true;
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader = async () => {};

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toBeUndefined();

    resetPluginSlots();

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });
  });
});
