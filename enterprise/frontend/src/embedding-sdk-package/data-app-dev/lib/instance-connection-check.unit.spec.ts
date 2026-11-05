import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import {
  DATA_APP_DEV_INSTANCE_PING_URL,
  DATA_APP_DEV_RELAY_ERROR_HEADER,
} from "../constants/diagnostics-channel";

import { instanceConnectionCheck } from "./instance-connection-check";

const METABASE_URL = "http://localhost:3000";

const run = (fetchFn: jest.Mock, metabaseUrl: string | undefined) => {
  window.fetch = fetchFn;

  return instanceConnectionCheck.install({ metabaseUrl, sdkVersion: "0.64.0" });
};

const realFetch = window.fetch;

beforeEach(() => devDiagnostics.clear());
afterEach(() => {
  window.fetch = realFetch;
});

describe("InstanceConnectionCheck", () => {
  it("reports the instance reachable when it answers the ping", async () => {
    await run(
      jest.fn(async () => new Response(null, { status: 200 })),
      METABASE_URL,
    );

    expect(devDiagnostics.getConnectionStatus()).toMatchObject({
      metabaseUrl: METABASE_URL,
      reachable: true,
      sdkVersion: "0.64.0",
    });
    expect(devDiagnostics.getConnectionStatus()?.error).toBeNull();
  });

  it("pings the instance's root through the dev server and calls no API", async () => {
    const fetchFn = jest.fn(async () => new Response(null, { status: 200 }));

    await run(fetchFn, METABASE_URL);

    // Every endpoint this used to call was a contract with a Metabase the
    // package does not ship with. The author pins the package while the
    // instance moves on, so a renamed route would report a healthy instance as
    // broken — or a broken one as healthy.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(DATA_APP_DEV_INSTANCE_PING_URL);
  });

  it("reports unreachable, with the reason, when the dev server can't reach the instance", async () => {
    await run(
      jest.fn(
        async () =>
          new Response("connect ECONNREFUSED 127.0.0.1:3000", {
            status: 502,
            headers: { [DATA_APP_DEV_RELAY_ERROR_HEADER]: "unreachable" },
          }),
      ),
      METABASE_URL,
    );

    expect(devDiagnostics.getConnectionStatus()).toMatchObject({
      reachable: false,
    });
    expect(devDiagnostics.getConnectionStatus()?.error).toContain(
      "ECONNREFUSED",
    );
  });

  it("reports unreachable when the dev server doesn't answer", async () => {
    await run(
      jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      METABASE_URL,
    );

    expect(devDiagnostics.getConnectionStatus()).toMatchObject({
      reachable: false,
    });
    expect(devDiagnostics.getConnectionStatus()?.error).toContain(
      "Failed to fetch",
    );
  });

  it("reports an unset URL without probing anything", async () => {
    const fetchFn = jest.fn();

    await run(fetchFn, undefined);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(devDiagnostics.getConnectionStatus()?.error).toContain(
      "DATA_APP_MB_URL is not set",
    );
  });

  it("rejects a URL without a scheme instead of probing the preview origin", async () => {
    const fetchFn = jest.fn();

    // The dev server can't relay to it, so nothing would answer for the instance.
    await run(fetchFn, "metabase.local");

    expect(fetchFn).not.toHaveBeenCalled();
    expect(devDiagnostics.getConnectionStatus()).toMatchObject({
      reachable: false,
    });
    expect(devDiagnostics.getConnectionStatus()?.error).toContain(
      "must be an absolute URL",
    );
  });
});
