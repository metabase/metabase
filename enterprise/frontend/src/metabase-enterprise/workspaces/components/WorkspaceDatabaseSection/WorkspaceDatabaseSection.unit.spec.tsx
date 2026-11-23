import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { WorkspaceDatabaseSectionProps } from "metabase/plugins";
import type {
  Database,
  DatabaseLocalSettingAvailability,
} from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { WorkspaceDatabaseSection } from "./WorkspaceDatabaseSection";

const DATABASE_ID = 1;

type UpdateDatabase = WorkspaceDatabaseSectionProps["updateDatabase"];

interface SetupOpts {
  database?: Database;
  availability?: DatabaseLocalSettingAvailability | null;
  updateDatabase?: UpdateDatabase;
}

const setup = ({
  database = createMockDatabase({ id: DATABASE_ID }),
  availability = { enabled: true },
  updateDatabase = jest
    .fn<ReturnType<UpdateDatabase>, Parameters<UpdateDatabase>>()
    .mockResolvedValue(undefined),
}: SetupOpts = {}) => {
  renderWithProviders(
    <WorkspaceDatabaseSection
      database={database}
      settingsAvailable={
        availability === null
          ? {}
          : { "database-enable-workspaces": availability }
      }
      updateDatabase={updateDatabase}
    />,
  );

  return { updateDatabase };
};

describe("WorkspaceDatabaseSection", () => {
  it("renders nothing when the setting is unavailable", () => {
    setup({ availability: null });

    expect(
      screen.queryByTestId("workspace-database-section"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the driver does not support workspaces", () => {
    setup({
      availability: {
        enabled: false,
        reasons: [
          {
            key: "driver-feature-missing",
            message: "The H2 driver does not support the `workspace` feature",
          },
        ],
      },
    });

    expect(
      screen.queryByTestId("workspace-database-section"),
    ).not.toBeInTheDocument();
  });

  it("disables the switch and shows the reason for any other disabled reason", () => {
    setup({
      availability: {
        enabled: false,
        reasons: [
          {
            key: "setting-disabled",
            message: "This setting is disabled for all databases.",
          },
        ],
      },
    });

    expect(screen.getByLabelText("Enable workspaces")).toBeDisabled();
    expect(
      screen.getByText("This setting is disabled for all databases."),
    ).toBeInTheDocument();
  });

  it("turns workspaces on", async () => {
    const { updateDatabase } = setup();

    const toggle = screen.getByLabelText("Enable workspaces");
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);

    expect(updateDatabase).toHaveBeenCalledTimes(1);
    expect(updateDatabase).toHaveBeenCalledWith({
      id: DATABASE_ID,
      settings: { "database-enable-workspaces": true },
    });
  });

  it("turns workspaces off", async () => {
    const { updateDatabase } = setup({
      database: createMockDatabase({
        id: DATABASE_ID,
        settings: { "database-enable-workspaces": true },
      }),
    });

    const toggle = screen.getByLabelText("Enable workspaces");
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    expect(updateDatabase).toHaveBeenCalledTimes(1);
    expect(updateDatabase).toHaveBeenCalledWith({
      id: DATABASE_ID,
      settings: { "database-enable-workspaces": false },
    });
  });

  it("disables turning workspaces on when database routing is enabled", () => {
    setup({
      database: createMockDatabase({
        id: DATABASE_ID,
        router_user_attribute: "region",
      }),
    });

    expect(screen.getByLabelText("Enable workspaces")).toBeDisabled();
    expect(
      screen.getByText(
        "Workspaces can't be enabled when database routing is enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the error when saving the setting fails", async () => {
    setup({
      updateDatabase: jest
        .fn<ReturnType<UpdateDatabase>, Parameters<UpdateDatabase>>()
        .mockRejectedValue({ data: { message: "Could not save the setting" } }),
    });

    await userEvent.click(screen.getByLabelText("Enable workspaces"));

    expect(
      await screen.findByText("Could not save the setting"),
    ).toBeInTheDocument();
  });
});
