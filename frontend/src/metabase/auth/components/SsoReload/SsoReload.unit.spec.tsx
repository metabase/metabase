import { renderWithProviders, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import * as domUtils from "metabase/utils/dom";

import { SsoReload } from "./SsoReload";

describe("SsoReload", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reloads the page on mount", async () => {
    const reloadSpy = jest
      .spyOn(domUtils, "reload")
      .mockImplementation(() => undefined);

    renderWithProviders(<Route path="sso" element={<SsoReload />} />, {
      withRouter: true,
      initialRoute: "/sso",
    });

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });
});
