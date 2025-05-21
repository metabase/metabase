import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, queryIcon, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { assertIndicatorHidden, assertIndicatorVisible, setup } from "./setup";

describe("CollectionMenu", () => {
  it("should be able to edit collection permissions with admin access", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Edit permissions")).toBeInTheDocument();
  });

  it("should not be able to edit collection permissions without admin access", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: false,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for personal collections", () => {
    setup({
      collection: createMockCollection({
        personal_owner_id: 1,
        can_write: true,
      }),
      isAdmin: true,
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for personal subcollections", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
      isPersonalCollectionChild: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("should be able to move and archive a collection with write access", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Move to trash")).toBeInTheDocument();
  });

  it("should not be able to move and archive a collection without write access", () => {
    setup({
      collection: createMockCollection({
        can_write: false,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to move and archive the root collection", () => {
    setup({
      collection: createMockCollection({
        id: "root",
        name: "Our analytics",
        can_write: true,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to move and archive personal collections", () => {
    setup({
      collection: createMockCollection({
        personal_owner_id: 1,
        can_write: true,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should not show 'Move questions into their dashboards' option if there's no dashboard question candidates", async () => {
    setup({
      collection: createMockCollection({ can_write: true }),
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Move questions into their dashboards"),
    ).not.toBeInTheDocument();
  });

  it("should show 'Move questions into their dashboards' option if there's dashboard question candidates", async () => {
    setup({
      collection: createMockCollection({ can_write: true }),
      dashboardQuestionCandidates: [dqCandidate],
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(
      await screen.findByText("Move questions into their dashboards"),
    ).toBeInTheDocument();
  });

  it("should not show 'Move questions into their dashboards' option if the user is not an admin", async () => {
    setup({
      collection: createMockCollection({ can_write: true }),
      dashboardQuestionCandidates: [dqCandidate],
      isAdmin: false,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Move questions into their dashboards"),
    ).not.toBeInTheDocument();
  });
});

describe("for your consideration", () => {
  describe("dashboard question candidates", () => {
    it("should show an indicator if we have never shown you the new menu option before, and dismiss when you open the menu", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [dqCandidate],
        isAdmin: true,
      });

      await assertIndicatorVisible();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.calls(
          "http://localhost/api/user-key-value/namespace/indicator-menu/key/collection-menu",
          { method: "PUT" },
        ),
      ).toHaveLength(1);

      expect(
        await screen.findByRole("menuitem", { name: /Move questions into/ }),
      ).toHaveTextContent("New");

      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Move questions into/ }),
      );

      expect(
        fetchMock.calls(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/move-to-dashboard",
          { method: "PUT" },
        ),
      ).toHaveLength(1);
    });

    it("should not show an indicator if there are no dq candidates", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [],
        isAdmin: true,
      });

      await assertIndicatorHidden();

      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.called(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toBe(false);
    });

    it("should not show an indicator if it has been previously dismissed", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [dqCandidate],
        isAdmin: true,
      });

      await assertIndicatorHidden();

      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.called(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toBe(false);

      expect(
        await screen.findByRole("menuitem", { name: /Move questions into/ }),
      ).toHaveTextContent("New");
    });

    it("should not show an indicator if we cannot render move to dashboard option", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [dqCandidate],
        isAdmin: false,
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.called(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toBe(false);
    });

    it("should not show an indicator if move to dashboard has been seen", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [dqCandidate],
        isAdmin: false,
        moveToDashboard: true,
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.called(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toBe(false);
    });

    it("should not show an new badge if move questions to dashboards has been clicked before", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        dashboardQuestionCandidates: [dqCandidate],
        isAdmin: true,
        moveToDashboard: true,
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.called(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toBe(false);

      expect(
        await screen.findByRole("menuitem", { name: /Move questions into/ }),
      ).not.toHaveTextContent("New");
    });
  });
});

const dqCandidate = {
  id: 1,
  name: "Card",
  description: null,
  sole_dashboard_info: {
    id: 1,
    name: "Dashboard",
    description: null,
  },
};
