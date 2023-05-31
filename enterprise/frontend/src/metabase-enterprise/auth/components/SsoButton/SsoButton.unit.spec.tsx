import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { SsoButton } from "./SsoButton";

const SITE_URL = "http://metabase.test";

const setup = () => {
  const state = createMockState({
    settings: createMockSettingsState({
      "site-url": SITE_URL,
    }),
  });

  jest.spyOn(window, "top", "get").mockReturnValue({
    ...window,
  });
  jest.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    href: `${SITE_URL}/auth/login`,
  });

  renderWithProviders(<SsoButton />, { storeInitialState: state });
};

describe("SSOButton", () => {
  it("should login immediately when embedded", async () => {
    setup();

    await waitFor(() => {
      expect(window.location.href).toBe(`${SITE_URL}/auth/sso`);
    });
  });
});
