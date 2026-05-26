import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupApplyAdvancedConfigEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { SetupWorkspaceModal } from "./SetupWorkspaceModal";

function setup() {
  const onClose = jest.fn();

  setupApplyAdvancedConfigEndpoint();

  renderWithProviders(
    <Route
      path="*"
      component={() => <SetupWorkspaceModal opened onClose={onClose} />}
    />,
    { withRouter: true },
  );

  return { onClose };
}

async function uploadConfigAndSubmit() {
  const submitButton = await screen.findByRole("button", { name: "Set up" });
  const file = new File(["name: Dev workspace"], "config.yml", {
    type: "application/yaml",
  });
  // Mantine's FileInput keeps the native file input hidden with no accessible
  // handle, so query the DOM directly to drive the upload.
  await userEvent.upload(
    // eslint-disable-next-line testing-library/no-node-access
    document.querySelector<HTMLInputElement>('input[type="file"]')!,
    file,
  );
  await userEvent.click(submitButton);
}

describe("SetupWorkspaceModal", () => {
  it("uploads the config and closes the modal", async () => {
    const { onClose } = setup();

    await uploadConfigAndSubmit();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
