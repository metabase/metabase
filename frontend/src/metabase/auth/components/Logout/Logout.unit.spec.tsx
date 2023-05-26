import React from "react";
import fetchMock from "fetch-mock";
import { setupLogoutEndpoints } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { Logout } from "./Logout";

const setup = () => {
  const location = window.location;
  jest.spyOn(window, "location", "get").mockReturnValue({
    ...location,
    reload: jest.fn(),
  });

  setupLogoutEndpoints();
  renderWithProviders(<Logout />);
};

describe("Logout", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should logout on mount", async () => {
    setup();

    await waitFor(() => expect(fetchMock.done("path:/api/session")).toBe(true));
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });
});
