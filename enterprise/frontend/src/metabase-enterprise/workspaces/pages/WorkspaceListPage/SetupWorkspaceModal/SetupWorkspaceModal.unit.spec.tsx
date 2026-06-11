import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupApplyAdvancedConfigEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { SetupWorkspaceModal } from "./SetupWorkspaceModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

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
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("uploads the config and closes the modal", async () => {
    const { onClose } = setup();

    await uploadConfigAndSubmit();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("tracks the workspaces_instance_setup event when the config is applied", async () => {
    setup();

    await uploadConfigAndSubmit();

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "workspaces_instance_setup",
        triggered_from: "upload",
      }),
    );
  });
});
