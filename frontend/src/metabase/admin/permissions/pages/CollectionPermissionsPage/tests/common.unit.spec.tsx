import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";

import { defaultPermissionsGraph, setup } from "./setup";

describe("Admin > CollectionPermissionsPage", () => {
  describe("CollectionPermissionsPage", () => {
    it("should show a collections tree in the sidebar", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();
      expect(await screen.findByText("Our analytics")).toBeVisible();
      const collectionItems = await screen.findAllByRole("menuitem", {
        name: /Collection One/,
      });
      expect(collectionItems[0]).toBeVisible();

      const collectionTwoItems = await screen.findAllByRole("menuitem", {
        name: /Collection Two/,
      });
      expect(collectionTwoItems[0]).toBeVisible();
    });

    it("should allow expansion of nested collections", async () => {
      await setup();

      const collection1 = (
        await screen.findAllByRole("menuitem", { name: /Collection One/ })
      )[0];
      expect(screen.queryAllByText("Nested One")).toHaveLength(0);
      await userEvent.click(collection1);
      expect(await screen.findByText("Nested One")).toBeInTheDocument();
    });

    it("should not show personal collection", async () => {
      await setup();

      expect(
        await screen.findByRole("menuitem", { name: /Collection One/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Personal/ }),
      ).not.toBeInTheDocument();
    });

    it("should show a permissions table for the selected collection", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();

      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Collection One/ }))[0],
      );
      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Nested One/ }))[0],
      );

      expect(
        await screen.findByText("Permissions for Nested One"),
      ).toBeVisible();
      expect(await screen.findByText("Administrators")).toBeVisible();
      expect(await screen.findByText("All internal users")).toBeVisible();
      expect(await screen.findByText("Other Users")).toBeVisible();

      // 1 groups has write, 1 has read, 1 has none
      expect(await screen.findByText("Curate")).toBeInTheDocument();
      expect(await screen.findByText("View")).toBeInTheDocument();
      expect(await screen.findByText("No access")).toBeInTheDocument();
    });

    it("can change group permissions", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();

      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Collection One/ }))[0],
      );
      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Nested One/ }))[0],
      );

      // change Other users from no access to view
      await userEvent.click(await screen.findByText("No access"));
      const listbox = await screen.findByRole("listbox");
      await userEvent.click(within(listbox).getByText("View"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Save changes"));

      // are you sure you want to save?
      await userEvent.click(await screen.findByText("Yes"));

      expect(
        screen.queryByText("You've made changes to permissions."),
      ).not.toBeInTheDocument();

      expect(await screen.findByText("Curate")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(2);
      expect(screen.queryByText("No access")).not.toBeInTheDocument();

      const lastCall = fetchMock.callHistory.lastCall(
        "path:/api/collection/graph",
        { method: "PUT" },
      );
      const lastRequest =
        typeof lastCall?.options?.body === "string"
          ? JSON.parse(lastCall?.options?.body)
          : undefined;

      expect(lastRequest).toEqual({
        ...defaultPermissionsGraph,
        groups: {
          3: {
            ...defaultPermissionsGraph.groups[3],
            3: "read",
          },
        },
      });
    });

    it("can propagate permissions changes to sub-collection", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();

      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Collection One/ }))[0],
      );

      // change other users from read to curate on collection one
      // should also change permissions on nested one from no access to curate
      const otherUsersRow = await screen
        .findAllByRole("row")
        .then((rows) => rows[3]);

      expect(within(otherUsersRow).getByText("Other Users")).toBeVisible();
      await userEvent.click(within(otherUsersRow).getByText("View"));

      const popover = await screen.findByRole("dialog");
      await userEvent.click(within(popover).getByRole("switch")); // propagate switch
      await userEvent.click(within(popover).getByText("Curate"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Save changes"));

      // are you sure you want to save?
      await userEvent.click(await screen.findByText("Yes"));

      expect(
        screen.queryByText("You've made changes to permissions."),
      ).not.toBeInTheDocument();

      expect(await screen.findAllByText("Curate")).toHaveLength(3);
      expect(screen.queryByText("No access")).not.toBeInTheDocument();

      const lastCall = fetchMock.callHistory.lastCall(
        "path:/api/collection/graph",
        { method: "PUT" },
      );
      const lastRequest =
        typeof lastCall?.options?.body === "string"
          ? JSON.parse(lastCall?.options?.body)
          : undefined;

      expect(lastRequest).toEqual({
        ...defaultPermissionsGraph,
        groups: {
          3: {
            ...defaultPermissionsGraph.groups[3],
            1: "write",
            3: "write",
          },
        },
      });
    });

    it("should show toggle to change sub-collection permissions if the collection has sub-collections", async () => {
      await setup();

      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Collection One/ }))[0],
      );
      await userEvent.click(await screen.findByText("View"));

      expect(
        await screen.findByText("Also change sub-collections"),
      ).toBeInTheDocument();
    });

    it("should not show toggle to change sub-collection permissions if the collection does not have sub-collections", async () => {
      await setup();

      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Collection One/ }))[0],
      );
      await userEvent.click(
        (await screen.findAllByRole("menuitem", { name: /Nested One/ }))[0],
      );
      await userEvent.click(await screen.findByText("View"));

      expect(
        screen.queryByText("Also change sub-collections"),
      ).not.toBeInTheDocument();
    });
  });

  it("hides the tenant collections tab when tenants feature is not available", async () => {
    setup();

    expect(
      screen.queryByRole("radio", { name: "Shared collections" }),
    ).not.toBeInTheDocument();
  });
});
