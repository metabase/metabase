import fetchMock from "fetch-mock";
import { setupLogoutEndpoint } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { Logout } from "./Logout";

const setup = () => {
  jest.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    reload: jest.fn(),
  });

  setupLogoutEndpoint();
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
