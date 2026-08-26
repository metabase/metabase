import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";

import { setRequestClientHeaders } from "./set-request-client-headers";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

describe("setRequestClientHeaders", () => {
  it("emits the client, version, and identifier headers when all are set", async () => {
    const handler = setRequestClientHeaders({
      name: "data-app",
      version: "1.2.3",
      identifier: "sales",
    });

    expect(await handler(REQUEST)).toEqual({
      headers: {
        "X-Metabase-Client": "data-app",
        "X-Metabase-Client-Version": "1.2.3",
        "X-Metabase-Client-Identifier": "sales",
      },
    });
  });

  it("omits the identifier header when the identifier is undefined", async () => {
    const handler = setRequestClientHeaders({ name: "data-app" });

    expect(await handler(REQUEST)).toEqual({
      headers: { "X-Metabase-Client": "data-app" },
    });
  });

  it("omits the identifier header when the identifier is empty", async () => {
    const handler = setRequestClientHeaders({
      name: "data-app",
      identifier: "",
    });

    expect(await handler(REQUEST)).toEqual({
      headers: { "X-Metabase-Client": "data-app" },
    });
  });

  it("emits no headers when nothing is set", async () => {
    const handler = setRequestClientHeaders({ name: "" });

    expect(await handler(REQUEST)).toEqual({ headers: {} });
  });
});
