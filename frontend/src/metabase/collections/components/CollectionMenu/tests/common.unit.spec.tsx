import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { setup } from "./setup";

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
        is_personal: true,
      }),
      isAdmin: true,
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for personal subcollections", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
        is_personal: true,
      }),
      isAdmin: true,
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
