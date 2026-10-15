import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { createMockDataApp } from "metabase-types/api/mocks";

import {
  FINCHES_GROUP_ID,
  OWLS_GROUP_ID,
  openGroupAssignmentPicker,
  setup,
} from "./tests/ManageDataAppGroupsPage.setup";

describe("ManageDataAppGroupsPage", () => {
  it("manages assignments when the app is disabled", async () => {
    setup({ app: createMockDataApp({ enabled: false }) });

    await openGroupAssignmentPicker();

    // can assign groups
    await userEvent.click(screen.getByRole("option", { name: "Finches" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByRole("button", { name: "Remove Finches" }),
    ).toBeInTheDocument();

    // can unassign groups
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Finches" }),
    );

    expect(
      await screen.findByText("No groups have access yet"),
    ).toBeInTheDocument();
  });

  it("shows member counts and filters invalid and assigned groups", async () => {
    setup({ groups: [{ id: OWLS_GROUP_ID, name: "Owls", member_count: 7 }] });

    expect(
      await screen.findByText("Manage access to Sales"),
    ).toBeInTheDocument();

    // member count should be visible
    expect(screen.getByText("7")).toBeInTheDocument();

    await openGroupAssignmentPicker();

    expect(
      screen.getByRole("option", { name: "All Users" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("option", { name: "Finches" })).toBeInTheDocument();

    // assigned groups, admins and tenant groups must not be selectable
    for (const invalid of ["Owls", "Administrators", "Tenant"]) {
      expect(
        screen.queryByRole("option", { name: invalid }),
      ).not.toBeInTheDocument();
    }
  });

  it("batch-assign selected groups", async () => {
    setup();

    await openGroupAssignmentPicker();

    // assign these groups
    await userEvent.click(screen.getByRole("option", { name: "Finches" }));
    await userEvent.click(screen.getByRole("option", { name: "Owls" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const requests = fetchMock.callHistory.calls(
        "path:/api/apps/sales/groups",
        { method: "POST" },
      );

      expect(
        requests.map(({ options }) => JSON.parse(String(options.body))),
      ).toEqual([{ group_ids: [FINCHES_GROUP_ID, OWLS_GROUP_ID] }]);
    });

    expect(
      await screen.findByRole("button", { name: "Remove Finches" }),
    ).toBeInTheDocument();
  });

  it("retries with the full selection if assigning group fails", async () => {
    setup({ failFirstAdd: true });
    await openGroupAssignmentPicker();

    await userEvent.click(screen.getByRole("option", { name: "Finches" }));
    await userEvent.click(screen.getByRole("option", { name: "Owls" }));

    const addGroups = () =>
      within(screen.getByTestId("data-app-groups-card")).getByRole("button", {
        name: "Add",
      });

    // first attempt should fail
    await userEvent.click(addGroups());
    expect(await screen.findByText("Failed to add groups")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Remove Finches" }),
    ).not.toBeInTheDocument();

    await userEvent.click(addGroups());

    // second retry attempt should pass
    expect(
      await screen.findByRole("button", { name: "Remove Finches" }),
    ).toBeInTheDocument();

    const requests = fetchMock.callHistory.calls(
      "path:/api/apps/sales/groups",
      { method: "POST" },
    );

    expect(
      requests.map(({ options }) => JSON.parse(String(options.body))),
    ).toEqual([
      { group_ids: [FINCHES_GROUP_ID, OWLS_GROUP_ID] },

      // second retry request should include the full selection
      { group_ids: [FINCHES_GROUP_ID, OWLS_GROUP_ID] },
    ]);
  });

  it("returns to the previous page after removing the last group", async () => {
    setup({
      groups: Array.from({ length: 26 }, (_, index) => ({
        id: index + 100,
        name: `Group ${index + 1}`,
        member_count: 0,
      })),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Next page" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Group 26" }),
    );

    expect(
      await screen.findByRole("button", { name: "Remove Group 1" }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Remove Group 26" }),
    ).not.toBeInTheDocument();
  });
});
