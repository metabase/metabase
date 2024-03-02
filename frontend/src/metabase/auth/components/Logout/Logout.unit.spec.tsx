import fetchMock from "fetch-mock";

import { setupLogoutEndpoint } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";

import { Logout } from "./Logout";

const setup = () => {
  setupLogoutEndpoint();
  renderWithProviders(<Logout />);
};

describe("Logout", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should logout on mount", async () => {
    jest.spyOn(domUtils, "reload").mockImplementation(() => undefined);

    setup();

    await waitFor(() => expect(fetchMock.done("path:/api/session")).toBe(true));
    await waitFor(() => expect(domUtils.reload).toHaveBeenCalled());
  });
});
