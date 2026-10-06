import userEvent from "@testing-library/user-event";

import { setupRemoteSyncTestConnectionEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import { GitTestConnectionButton } from "./GitTestConnectionButton";

const VALUES: RemoteSyncConfigurationSettings = {
  "remote-sync-enabled": true,
  "remote-sync-url": "https://github.com/test/repo.git",
  "remote-sync-token": "ghp_abc123",
  "remote-sync-type": "read-only",
  "remote-sync-branch": "main",
};

const setup = ({
  values = VALUES,
  error,
}: {
  values?: RemoteSyncConfigurationSettings;
  error?: { status: number; message: string };
} = {}) => {
  setupRemoteSyncTestConnectionEndpoint({ error });
  const { rerender } = renderWithProviders(
    <GitTestConnectionButton values={values} />,
  );
  return {
    rerender: (newValues: RemoteSyncConfigurationSettings) =>
      rerender(<GitTestConnectionButton values={newValues} />),
  };
};

const clickTestConnection = () =>
  userEvent.click(screen.getByRole("button", { name: /Test connection/i }));

describe("GitTestConnectionButton", () => {
  it("should show the success icon when the connection succeeds", async () => {
    setup();
    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();
  });

  it("should show the server error in the failure icon's tooltip", async () => {
    setup({
      error: { status: 400, message: "Authentication failed" },
    });
    await clickTestConnection();

    await userEvent.hover(await screen.findByLabelText("Connection failed"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Authentication failed",
    );
  });

  it("should keep the result when a value outside the request changes", async () => {
    const { rerender } = setup();
    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();

    rerender({ ...VALUES, "remote-sync-branch": "develop" });
    expect(screen.getByLabelText("Connection successful")).toBeInTheDocument();
  });

  it.each([
    {
      name: "URL",
      change: { "remote-sync-url": "https://github.com/x/y.git" },
    },
    { name: "token", change: { "remote-sync-token": "ghp_other" } },
  ])("should clear the result when the $name changes", async ({ change }) => {
    const { rerender } = setup();
    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();

    rerender({ ...VALUES, ...change });
    expect(
      screen.queryByLabelText("Connection successful"),
    ).not.toBeInTheDocument();
  });
});
