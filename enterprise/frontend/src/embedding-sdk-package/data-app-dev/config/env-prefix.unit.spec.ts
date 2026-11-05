import { dataAppEnvPrefix } from "./env-prefix";

const exposes = (prefixes: string[] | undefined, name: string) =>
  (prefixes ?? ["VITE_"]).some((prefix) => name.startsWith(prefix));

describe("dataAppEnvPrefix", () => {
  it("keeps the instance URL, the API key and other .env.local secrets out of the dev preview page (serve)", () => {
    const prefixes = dataAppEnvPrefix("serve");

    expect(exposes(prefixes, "DATA_APP_MB_URL")).toBe(false);
    expect(exposes(prefixes, "DATA_APP_MB_API_KEY")).toBe(false);
    // Vite's default prefix, which a repo-root .env.local may use for its own secrets.
    expect(exposes(prefixes, "VITE_MB_API_KEY")).toBe(false);
  });

  it("exposes no DATA_APP_ env vars in a production build", () => {
    expect(dataAppEnvPrefix("build")).toBeUndefined();
  });
});
