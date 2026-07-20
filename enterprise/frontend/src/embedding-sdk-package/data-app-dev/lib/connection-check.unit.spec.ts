import {
  clearDevDiagnostics,
  getDevConnectionStatus,
} from "../components/DevToolbar/diagnostics";

import { runDevConnectionCheck } from "./connection-check";

const METABASE_URL = "http://localhost:3000";

const run = (fetchFn: jest.Mock, metabaseUrl: string | undefined) =>
  runDevConnectionCheck({ metabaseUrl, sdkVersion: "0.64.0", fetchFn });

beforeEach(() => clearDevDiagnostics());

describe("runDevConnectionCheck", () => {
  it("reports the instance reachable when the ping resolves", async () => {
    await run(
      jest.fn(async () => new Response(null, { status: 200 })),
      METABASE_URL,
    );

    expect(getDevConnectionStatus()).toMatchObject({
      metabaseUrl: METABASE_URL,
      reachable: true,
      sdkVersion: "0.64.0",
    });
    expect(getDevConnectionStatus()?.error).toBeUndefined();
  });

  it("pings the instance URL itself and calls no API", async () => {
    const fetchFn = jest.fn(async () => new Response(null, { status: 200 }));

    await run(fetchFn, METABASE_URL);

    // Every endpoint this used to call was a contract with a Metabase the
    // package does not ship with. The author pins the package while the
    // instance moves on, so a renamed route would report a healthy instance as
    // broken — or a broken one as healthy.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(METABASE_URL, { mode: "no-cors" });
  });

  it("reports unreachable when the ping rejects", async () => {
    await run(
      jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      METABASE_URL,
    );

    expect(getDevConnectionStatus()).toMatchObject({ reachable: false });
    expect(getDevConnectionStatus()?.error).toContain("Failed to fetch");
  });

  it("reports an unset URL without probing anything", async () => {
    const fetchFn = jest.fn();

    await run(fetchFn, undefined);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(getDevConnectionStatus()?.error).toContain(
      "DATA_APP_MB_URL is not set",
    );
  });
});
