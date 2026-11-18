import { DATA_APP_PUBLIC_ENV_PREFIX } from "./env-prefix";

// Vite exposes an env var to the bundle when its name starts with the prefix.
const isExposed = (name: string) => name.startsWith(DATA_APP_PUBLIC_ENV_PREFIX);

describe("DATA_APP_PUBLIC_ENV_PREFIX", () => {
  it("keeps the instance URL and the API key out of the bundle", () => {
    expect(isExposed("DATA_APP_MB_URL")).toBe(false);
    expect(isExposed("DATA_APP_MB_API_KEY")).toBe(false);
  });

  it("keeps vars with Vite's default prefix out of the bundle", () => {
    expect(isExposed("VITE_MB_API_KEY")).toBe(false);
  });

  it("exposes the vars an app marks as public", () => {
    expect(isExposed("DATA_APP_PUBLIC_REGION")).toBe(true);
  });
});
