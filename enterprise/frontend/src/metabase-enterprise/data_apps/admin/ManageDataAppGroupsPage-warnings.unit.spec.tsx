import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import type { DataAppGroupPermissionWarning } from "metabase-types/api";

import {
  FINCHES_GROUP_ID,
  OWLS_GROUP_ID,
  openGroupAssignmentPicker,
  setup,
} from "./tests/ManageDataAppGroupsPage.setup";

const FINCHES_WARNING = {
  group_id: FINCHES_GROUP_ID,
  missing_tables: [
    {
      id: 10,
      name: "Orders",
      schema: "public",
      database_id: 1,
      database_name: "Birds",
    },
  ],
};

describe("ManageDataAppGroupsPage warnings", () => {
  it("shows missing tables for assigned groups on hover", async () => {
    setup({
      groups: [{ id: FINCHES_GROUP_ID, name: "Finches", member_count: 0 }],
      warnings: [FINCHES_WARNING],
    });

    await userEvent.hover(
      await screen.findByRole("button", { name: "Missing data access" }),
    );

    expect(
      screen.getByRole("columnheader", { name: "Data access" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Finches doesn’t have permission to view these tables used in this app:",
      ),
    ).toBeInTheDocument();

    await userEvent.hover(screen.getByRole("link", { name: "Orders" }));

    const ordersLink = screen.getByRole("link", { name: "Orders" });
    expect(ordersLink).toBeVisible();

    expect(ordersLink).toHaveAttribute(
      "href",
      expect.stringContaining("/admin/permissions/data"),
    );
  });

  it("clears a removed group's warning", async () => {
    setup({
      groups: [
        { id: FINCHES_GROUP_ID, name: "Finches", member_count: 0 },
        { id: OWLS_GROUP_ID, name: "Owls", member_count: 2 },
      ],
      warnings: [FINCHES_WARNING],
    });

    expect(
      await within(
        await screen.findByRole("row", { name: /Finches/ }),
      ).findByRole("button", { name: "Missing data access" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Finches" }),
    );

    // after group is removed, there should be no warning
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Missing data access" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("updates assignments while warning check is still pending", async () => {
    const warningsResponse = defer<DataAppGroupPermissionWarning[]>();

    setup({
      groups: [{ id: OWLS_GROUP_ID, name: "Owls", member_count: 2 }],
      warningsResponse: warningsResponse.promise,
    });

    try {
      await openGroupAssignmentPicker();

      await userEvent.click(screen.getByRole("option", { name: "Finches" }));
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      // without updating the cache, finches group never shows because
      // RTK Query delays cache invalidation until the "group warning" request is done;
      // see `onQueryStarted` in `api/data-app.ts`
      expect(
        await screen.findByRole("button", { name: "Remove Finches" }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Owls" }),
      );

      // owls group should be removed
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Remove Owls" }),
        ).not.toBeInTheDocument(),
      );

      expect(
        screen.getByRole("button", { name: "Remove Finches" }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Finches" }),
      );

      // finches group should be removed
      expect(
        await screen.findByText("No groups have access yet"),
      ).toBeInTheDocument();
    } finally {
      warningsResponse.resolve([]);
    }
  });
});
