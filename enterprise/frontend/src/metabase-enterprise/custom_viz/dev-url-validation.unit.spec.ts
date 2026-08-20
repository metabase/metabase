import { getDevUrlError } from "./dev-url-validation";

describe("getDevUrlError", () => {
  it.each([
    "http://localhost:5174",
    "http://localhost:5174/",
    "http://LOCALHOST:5174",
    "https://127.0.0.1:5174",
    "http://[::1]:5174",
    "http://localhost",
  ])("accepts the loopback origin %s", (url) => {
    expect(getDevUrlError(url)).toBeNull();
  });

  it.each([
    "ftp://localhost:5174",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])("rejects the non-http(s) scheme in %s", (url) => {
    expect(getDevUrlError(url)).toBeTruthy();
  });

  // The browser is what fetches the bundle, so a dev server is always on the developer's own machine.
  // Holding the value to loopback is what makes widening the CSP connect-src to it harmless.
  it.each([
    "http://10.0.0.5:5174",
    "http://169.254.169.254",
    "https://evil.com",
    "http://evil.com#@localhost",
    "http://localhost.evil.com",
  ])("rejects the non-loopback host in %s", (url) => {
    expect(getDevUrlError(url)).toMatch(/must point at localhost/);
  });

  it("tells a Docker user what to use instead of host.docker.internal", () => {
    // It resolves inside the container only, so it cannot work now that the browser does the fetching.
    expect(getDevUrlError("http://host.docker.internal:5174")).toMatch(
      /http:\/\/localhost:5174/,
    );
  });

  it.each([
    "http://localhost:5174/evil",
    "http://localhost:5174?a=1",
    "http://localhost:5174#f",
  ])("rejects anything richer than an origin: %s", (url) => {
    expect(getDevUrlError(url)).toMatch(/bare origin/);
  });

  it("rejects a string that is not a URL at all", () => {
    expect(getDevUrlError("not a url")).toBeTruthy();
  });
});
