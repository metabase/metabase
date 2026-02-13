import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateWorkspaceEndpoint,
  setupWorkspaceCheckoutEndpoint,
  setupWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  Transform,
  Workspace,
  WorkspaceCheckoutResponse,
  WorkspaceItem,
} from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks";

import { EditTransformMenu } from "./EditTransformMenu";

const DATABASE_ID = 1;

function createMockWorkspaceItem(opts?: Partial<WorkspaceItem>): WorkspaceItem {
  return {
    id: 1,
    name: "Workspace 1",
    database_id: DATABASE_ID,
    status: "ready",
    updated_at: "2024-01-01T00:00:00Z",
    ...opts,
  };
}

function createMockWorkspace(opts?: Partial<Workspace>): Workspace {
  return {
    id: 1,
    name: "Workspace 1",
    status: "ready",
    database_id: DATABASE_ID,
    ...opts,
  };
}

type SetupOpts = {
  transform?: Transform;
  workspaces?: WorkspaceItem[];
  checkoutResponse?: Partial<WorkspaceCheckoutResponse>;
};

function setup({
  transform = createMockTransform({
    id: 1,
    name: "Test Transform",
    source: {
      type: "query",
      query: { database: DATABASE_ID, type: "native", native: { query: "" } },
    },
  }),
  workspaces = [],
  checkoutResponse = {},
}: SetupOpts = {}) {
  setupWorkspacesEndpoint(workspaces);
  setupWorkspaceCheckoutEndpoint(checkoutResponse);
  setupCreateWorkspaceEndpoint(
    createMockWorkspace({ id: 99, name: "New Workspace" }),
  );

  renderWithProviders(
    <Route
      component={() => <EditTransformMenu transform={transform} />}
      path="/"
    />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );
}

function findMenuItemByText(text: string) {
  return screen.getAllByRole("menuitem").find((item) => {
    return item.textContent?.includes(text);
  });
}

describe("EditTransformMenu", () => {
  it("should render menu items and sort workspaces with existing checkouts first", async () => {
    setup({
      workspaces: [
        createMockWorkspaceItem({ id: 1, name: "Workspace A" }),
        createMockWorkspaceItem({ id: 2, name: "Workspace B" }),
        createMockWorkspaceItem({ id: 3, name: "Workspace C" }),
      ],
      checkoutResponse: {
        // Return workspaces in order where existing ones come last from backend
        workspaces: [
          { id: 1, name: "Workspace A", status: "ready", existing: null },
          { id: 2, name: "Workspace B", status: "ready", existing: null },
          {
            id: 3,
            name: "Workspace C",
            status: "ready",
            existing: { ref_id: "abc123", name: "Test Transform" },
          },
        ],
      },
    });

    // Wait for button to finish loading before clicking
    const editButton = await screen.findByRole("button", { name: /Edit/i });
    await waitFor(() => {
      expect(editButton).not.toHaveAttribute("data-loading", "true");
    });

    await userEvent.click(editButton);

    // Verify basic menu structure renders
    expect(screen.getByText("Add to workspace")).toBeInTheDocument();
    expect(screen.getByText("New workspace")).toBeInTheDocument();

    // Wait for workspaces to load
    await waitFor(() => {
      expect(screen.getByText("Workspace C")).toBeInTheDocument();
    });
    expect(screen.getByText("Workspace A")).toBeInTheDocument();
    expect(screen.getByText("Workspace B")).toBeInTheDocument();

    // Verify sorting: workspaces with existing checkouts should be first
    const menuItems = screen.getAllByRole("menuitem").filter((item) => {
      const text = item.textContent;
      return (
        text?.includes("Workspace A") ||
        text?.includes("Workspace B") ||
        text?.includes("Workspace C")
      );
    });

    // Workspace C should be first because it has existing checkout
    expect(menuItems[0]).toHaveTextContent("Workspace C");
    expect(menuItems[1]).toHaveTextContent("Workspace A");
    expect(menuItems[2]).toHaveTextContent("Workspace B");
  });

  describe("checkout disabled tooltips", () => {
    it("should disable 'New workspace' and workspace items when checkout_disabled is 'mbql'", async () => {
      setup({
        workspaces: [createMockWorkspaceItem({ id: 1, name: "Workspace A" })],
        checkoutResponse: {
          checkout_disabled: "mbql",
          workspaces: [
            { id: 1, name: "Workspace A", status: "ready", existing: null },
          ],
        },
      });

      const editButton = await screen.findByRole("button", { name: /Edit/i });
      await waitFor(() => {
        expect(editButton).not.toHaveAttribute("data-loading", "true");
      });

      await userEvent.click(editButton);

      // Find menu items
      const newWorkspaceItem = findMenuItemByText("New workspace");
      const workspaceAItem = findMenuItemByText("Workspace A");

      expect(newWorkspaceItem).toHaveAttribute("data-disabled", "true");
      expect(workspaceAItem).toHaveAttribute("data-disabled", "true");
    });

    it("should show tooltip with MBQL message when hovering disabled items", async () => {
      setup({
        workspaces: [createMockWorkspaceItem({ id: 1, name: "Workspace A" })],
        checkoutResponse: {
          checkout_disabled: "mbql",
          workspaces: [
            { id: 1, name: "Workspace A", status: "ready", existing: null },
          ],
        },
      });

      const editButton = await screen.findByRole("button", { name: /Edit/i });
      await waitFor(() => {
        expect(editButton).not.toHaveAttribute("data-loading", "true");
      });

      await userEvent.click(editButton);

      const newWorkspaceItem = findMenuItemByText("New workspace");
      await userEvent.hover(newWorkspaceItem!);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Transforms based on the query builder cannot be edited in a workspace.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("should show tooltip with card-reference message when checkout is disabled", async () => {
      setup({
        workspaces: [createMockWorkspaceItem({ id: 1, name: "Workspace A" })],
        checkoutResponse: {
          checkout_disabled: "card-reference",
          workspaces: [
            { id: 1, name: "Workspace A", status: "ready", existing: null },
          ],
        },
      });

      const editButton = await screen.findByRole("button", { name: /Edit/i });
      await waitFor(() => {
        expect(editButton).not.toHaveAttribute("data-loading", "true");
      });

      await userEvent.click(editButton);

      const workspaceItem = findMenuItemByText("Workspace A");
      await userEvent.hover(workspaceItem!);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Transforms referencing other questions cannot be edited in a workspace.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("should not disable items when checkout_disabled is null", async () => {
      setup({
        workspaces: [createMockWorkspaceItem({ id: 1, name: "Workspace A" })],
        checkoutResponse: {
          checkout_disabled: null,
          workspaces: [
            { id: 1, name: "Workspace A", status: "ready", existing: null },
          ],
        },
      });

      const editButton = await screen.findByRole("button", { name: /Edit/i });
      await waitFor(() => {
        expect(editButton).not.toHaveAttribute("data-loading", "true");
      });

      await userEvent.click(editButton);

      const newWorkspaceItem = findMenuItemByText("New workspace");
      const workspaceAItem = findMenuItemByText("Workspace A");

      expect(newWorkspaceItem).not.toHaveAttribute("data-disabled", "true");
      expect(workspaceAItem).not.toHaveAttribute("data-disabled", "true");
    });
  });
});
