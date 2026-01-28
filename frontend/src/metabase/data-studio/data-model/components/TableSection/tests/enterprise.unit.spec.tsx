import { screen } from "__support__/ui";

import { type SetupOpts, setup } from "./setup";

describe("TableSection", () => {
  const commonSettings: Partial<SetupOpts> = {
    enterprisePlugins: ["library", "remote_sync"],
    tokenFeatures: { data_studio: true, remote_sync: true },
  };

  it("should render publish button for admins", () => {
    setup({
      ...commonSettings,
      isAdmin: true,
    });

    expect(screen.getByText("Publish")).toBeInTheDocument();
  });

  it("should render publish button for data analysts", () => {
    setup({ ...commonSettings, isDataAnalyst: true });

    expect(screen.getByText("Publish")).toBeInTheDocument();
  });

  it("should not render publish button when remote sync is set to read-only", () => {
    setup({ ...commonSettings, remoteSyncType: "read-only" });

    expect(screen.queryByText("Publish")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpublish")).not.toBeInTheDocument();
  });
});
