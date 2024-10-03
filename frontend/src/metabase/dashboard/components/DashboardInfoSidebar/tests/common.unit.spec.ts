import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

jest.mock("metabase/dashboard/constants", () => ({
  ...jest.requireActual("metabase/dashboard/constants"),
  DASHBOARD_DESCRIPTION_MAX_LENGTH: 20,
}));

describe("DashboardInfoSidebar", () => {
  it("should render the component", () => {
    setup();

    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should render overview tab", () => {
    setup();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  });

  it("should render history tab", () => {
    setup();
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
  });

  it("should show description when clicking on overview tab", async () => {
    await setup();
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("should show history when clicking on history tab", async () => {
    await setup();
    await userEvent.click(screen.getByRole("tab", { name: "History" }));

    expect(screen.getByTestId("dashboard-history-list")).toBeInTheDocument();
  });

  it("should close when clicking the close button", async () => {
    const { onClose } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should allow to set description", async () => {
    const { setDashboardAttribute } = await setup();

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.type(
      screen.getByPlaceholderText("Add description"),
      "some description",
    );
    await userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith(
      "description",
      "some description",
    );
  });

  it("should validate description length", async () => {
    const expectedErrorMessage = "Must be 20 characters or less";
    const { setDashboardAttribute } = await setup();

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.type(
      screen.getByPlaceholderText("Add description"),
      "in incididunt incididunt laboris ut elit culpa sit dolor amet",
    );
    await userEvent.tab();

    expect(screen.getByText(expectedErrorMessage)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("editable-text"));
    expect(screen.queryByText(expectedErrorMessage)).not.toBeInTheDocument();

    await userEvent.tab();
    expect(screen.getByText(expectedErrorMessage)).toBeInTheDocument();

    expect(setDashboardAttribute).not.toHaveBeenCalled();
  });

  it("should allow to clear description", async () => {
    const { setDashboardAttribute } = await setup({
      dashboard: createMockDashboard({ description: "some description" }),
    });

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.clear(screen.getByPlaceholderText("Add description"));
    await userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith("description", "");
  });

  it("should show last edited info", async () => {
    await setup({
      dashboard: createMockDashboard({
        "last-edit-info": {
          timestamp: "1793-09-22T00:00:00",
          first_name: "Frodo",
          last_name: "Baggins",
          email: "dontlikejewelry@example.com",
          id: 7,
        },
      }),
    });
    expect(screen.getByText("Creator and last editor")).toBeInTheDocument();
    expect(screen.getByText("September 22, 1793")).toBeInTheDocument();
    expect(screen.getByText("by Frodo Baggins")).toBeInTheDocument();
  });

  it("should show creator info", async () => {
    await setup({
      dashboard: createMockDashboard({
        creator_id: 1,
        "last-edit-info": {
          timestamp: "1793-09-22T00:00:00",
          first_name: "Frodo",
          last_name: "Baggins",
          email: "dontlikejewelry@example.com",
          id: 7,
        },
      }),
    });

    expect(screen.getByText("Creator and last editor")).toBeInTheDocument();
    expect(screen.getByText("January 1, 2024")).toBeInTheDocument();
    expect(screen.getByText("by Testy Tableton")).toBeInTheDocument();
  });

  it("should show collection", async () => {
    await setup({
      dashboard: createMockDashboard({
        collection: createMockCollection({
          name: "My little collection ",
        }),
      }),
    });

    expect(screen.getByText("Saved in")).toBeInTheDocument();
    expect(await screen.findByText("My little collection")).toBeInTheDocument();
  });

  it("should not show Visibility section when not shared publicly", async () => {
    await setup();
    expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
  });

  it("should show Visibility section when dashboard has a public link", async () => {
    await setup({ dashboard: createMockDashboard({ public_uuid: "123" }) });
    expect(screen.getByText("Visibility")).toBeInTheDocument();
  });

  it("should show visibility section when embedding is enabled", async () => {
    await setup({ dashboard: createMockDashboard({ enable_embedding: true }) });
    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.getByText("Embedded")).toBeInTheDocument();
  });

  describe("DashboardInfoSidebar > enterprise", () => {
    describe("entity id display", () => {
      it("should not show entity ids without serialization feature", async () => {
        const dashboard = createMockDashboard({
          entity_id: "jenny8675309" as Dashboard["entity_id"],
        });
        await setup({ dashboard });

        expect(screen.queryByText("Entity ID")).not.toBeInTheDocument();
        expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
      });
    });
  });
});
