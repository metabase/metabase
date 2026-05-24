import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupApplyAdvancedConfigEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { SetupWorkspaceModal } from "./SetupWorkspaceModal";

function setup() {
  setupApplyAdvancedConfigEndpoint();

  const onClose = jest.fn();
  renderWithProviders(
    <Route
      path="*"
      component={() => <SetupWorkspaceModal opened onClose={onClose} />}
    />,
    { withRouter: true },
  );
  return { onClose };
}

describe("SetupWorkspaceModal", () => {
  it("POSTs the uploaded file to /api/ee/advanced-config", async () => {
    setup();

    const fileInput = screen.getByLabelText<HTMLInputElement>("Config file", {
      selector: 'input[type="file"]',
    });
    const file = new File(["version: 1\nconfig: {}\n"], "config.yml", {
      type: "application/yaml",
    });
    await userEvent.upload(fileInput, file);
    await userEvent.click(screen.getByRole("button", { name: "Set up" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/advanced-config", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });
});
