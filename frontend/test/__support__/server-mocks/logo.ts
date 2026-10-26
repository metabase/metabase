import fetchMock from "fetch-mock";

const DEFAULT_LOGO_URL = "app/assets/img/logo.svg";

/**
 * `LogoIcon` fetches the logo and inlines it, so every component that renders
 * it needs the asset mocked, whitelabeled or not.
 */
export function setupLogoEndpoint(svg = "<svg />") {
  fetchMock.get(`end:${DEFAULT_LOGO_URL}`, svg, { name: "logo" });
}
