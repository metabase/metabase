import { renderWithProviders, waitFor } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SsoButton } from "./SsoButton";

const SITE_URL = "http://metabase.test";

const setup = () => {
  const state = createMockState({
    settings: createMockSettingsState({
      "site-url": SITE_URL,
    }),
  });

  // simulate ebmedding
  jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);

  renderWithProviders(<SsoButton />, { storeInitialState: state });
};

describe("SSOButton", () => {
  it("should login immediately when embedded", async () => {
    jest.spyOn(domUtils, "redirect").mockImplementation(() => undefined);

    setup();

    await waitFor(() => {
      expect(domUtils.redirect).toHaveBeenCalledTimes(1);
    });

    // can't change window.location in jsdom, so have to check a wrapper
    expect(domUtils.redirect).toHaveBeenCalledWith(`${SITE_URL}/auth/sso`);
  });
});
