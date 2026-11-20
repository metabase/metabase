import userEvent from "@testing-library/user-event";

import {
  setupPermissionPreviewAttributesEndpoint,
  setupPermissionPreviewCollectionsEndpoint,
  setupPermissionPreviewDataEndpoint,
  setupPermissionPreviewPrincipalsEndpoint,
  setupPermissionPreviewUnsavedEditsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { PreviewBanner } from "./PreviewBanner";
import type {
  AffectingAttribute,
  PreviewPrincipal,
  PrincipalType,
} from "./api";
import type { PreviewState } from "./preview-state";

jest.mock("./PreviewBand.module.css", () => ({ bandButton: "bandButton" }));

const STATE: PreviewState = {
  userId: 2,
  userName: "Sandy Sales",
  principalType: "user",
  principalId: 2,
  principalName: "Sandy Sales",
  attributes: {},
  returnPath: "/admin/permissions/data",
};

const SANDY: PreviewPrincipal = {
  type: "user",
  id: 2,
  name: "Sandy Sales",
  detail: null,
  member_count: null,
  superuser: false,
  tenant_side: false,
  attributes: null,
  groups: [{ id: 1, name: "All internal users" }],
};

const CATEGORY: AffectingAttribute = {
  attribute: "category",
  value: "Doohickey",
  uses: [
    {
      kind: "sandbox",
      label: "Products",
      table_id: 1,
      column: "Products.Category",
    },
  ],
  applies: false,
  other_values: ["Gizmo"],
};

describe("PreviewBanner", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("with unsaved changes", () => {
    it("says in the band that the preview includes them, with no separate bar, and puts the With my changes switch in See changes", async () => {
      await setup({
        widthPx: 1440,
        unsavedEdits: { id: "edits-1", isApplied: true },
      });

      expect(
        await screen.findByText("· 1 unsaved change included"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("status", { name: "Unsaved changes" }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "See changes" }),
      );

      expect(
        await screen.findByRole("radio", { name: "With my changes" }),
      ).toBeChecked();
    });

    it("says in the band when the preview leaves them out", async () => {
      await setup({
        widthPx: 1440,
        unsavedEdits: { id: "edits-1", isApplied: false },
      });

      expect(
        await screen.findByText("· 1 unsaved change left out"),
      ).toBeInTheDocument();
    });
  });

  describe("on a tablet (768px)", () => {
    it("opens with the Preview settings panel closed, and the toggle opens it", async () => {
      await setup({ widthPx: 768 });

      expect(
        screen.queryByRole("navigation", { name: "Preview settings" }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", {
          // the icon names itself in tests
          name: "sidebar_open icon Preview settings",
        }),
      );
      expect(
        screen.getByRole("navigation", { name: "Preview settings" }),
      ).toBeInTheDocument();
    });

    it("keeps Preview settings white under its hover tint, like Explain access", async () => {
      await setup({ widthPx: 768 });

      expect(
        screen.getByRole("button", {
          name: "sidebar_open icon Preview settings",
        }),
      ).toHaveClass("bandButton");
    });

    it("shortens Exit preview to Exit and Explain access to an icon with a tooltip", async () => {
      await setup({ widthPx: 768 });

      expect(
        screen.getByRole("button", { name: "Exit preview" }),
      ).toHaveTextContent("Exit");
      expect(
        screen.getByRole("button", { name: "Exit preview" }),
      ).not.toHaveTextContent("Exit preview");
      const explainAccess = screen.getByRole("button", {
        name: "Explain access",
      });
      expect(explainAccess).toHaveTextContent("");

      await userEvent.hover(explainAccess);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Explain access",
      );
    });

    it("keeps the panel open when it was opened earlier in this tab", async () => {
      window.sessionStorage.setItem("metabase.permissionPreview.panel", "open");
      await setup({ widthPx: 768 });

      expect(
        screen.getByRole("navigation", { name: "Preview settings" }),
      ).toBeInTheDocument();
    });
  });

  describe("with a rule that reads an attribute", () => {
    it("shows no attribute chips in a user's panel", async () => {
      await setup({ widthPx: 1440, attributes: [CATEGORY] });

      expect(
        screen.getByRole("navigation", { name: "Preview settings" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("toolbar", {
          name: "User attributes used by rules",
        }),
      ).not.toBeInTheDocument();
    });

    it("guard: shows the chips in a group's panel", async () => {
      await setup({
        widthPx: 1440,
        attributes: [CATEGORY],
        principalType: "group",
      });

      expect(
        await screen.findByRole("button", { name: /category/ }),
      ).toBeInTheDocument();
    });
  });

  describe("on a wide screen (1440px)", () => {
    it("opens with the panel open and the buttons' full labels", async () => {
      await setup({ widthPx: 1440 });

      expect(
        screen.getByRole("navigation", { name: "Preview settings" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Exit preview" }),
      ).toHaveTextContent("Exit preview");
      expect(
        screen.getByRole("button", { name: "Explain access" }),
      ).toHaveTextContent("Explain access");
    });

    it("reaches the band's buttons before the panel with Tab", async () => {
      await setup({ widthPx: 1440 });

      await userEvent.tab();
      expect(
        screen.getByRole("button", {
          // the icon names itself in tests
          name: "sidebar_open icon Preview settings",
        }),
      ).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Sandy Sales" })).toHaveFocus();
      await userEvent.tab();
      expect(
        screen.getByRole("button", { name: "Explain access" }),
      ).toHaveFocus();
      await userEvent.tab();
      expect(
        screen.getByRole("button", { name: "Exit preview" }),
      ).toHaveFocus();
      await userEvent.tab();
      expect(
        screen.getByRole("button", { name: "Collapse the preview settings" }),
      ).toHaveFocus();
    });
  });
});

type SetupOpts = {
  widthPx: number;
  unsavedEdits?: PreviewState["unsavedEdits"];
  /** What the rules read, as the attributes endpoint lists them. */
  attributes?: AffectingAttribute[];
  /** Who is previewed: user 2, Sandy Sales, or group 2, Sales. */
  principalType?: PrincipalType;
};

async function setup({
  widthPx,
  unsavedEdits,
  attributes = [],
  principalType = "user",
}: SetupOpts) {
  mockWindowWidth(widthPx);
  setupPermissionPreviewAttributesEndpoint(attributes);
  setupPermissionPreviewPrincipalsEndpoint({
    users: [
      {
        id: 2,
        name: "Sandy Sales",
        email: "sandy@example.com",
        group_ids: [1],
        detail: null,
        member_count: null,
        tenant_side: false,
      },
    ],
    groups: [
      {
        id: 2,
        name: "Sales",
        detail: null,
        member_count: 7,
        tenant_side: false,
        built_in: false,
      },
    ],
  });
  // the name's card, open while the name has focus
  setupPermissionPreviewCollectionsEndpoint("default", {
    principal: SANDY,
    applies: true,
    reason: null,
    collections: [],
  });
  if (unsavedEdits != null) {
    setupPermissionPreviewUnsavedEditsEndpoint(unsavedEdits.id, [
      {
        group_id: 1,
        group_name: "All internal users",
        database_id: 1,
        label: "Sample Database",
        permission: "View data",
        before: "Blocked",
        after: "Can view",
      },
    ]);
    // See changes reads the person's groups from it
    setupPermissionPreviewDataEndpoint({ principal: SANDY, databases: [] });
  }

  renderWithProviders(
    <PreviewBanner
      state={{
        ...STATE,
        principalType,
        principalName: principalType === "user" ? "Sandy Sales" : "Sales",
        unsavedEdits,
      }}
    />,
    { withRouter: true },
  );
  await screen.findByRole("status", { name: "Previewing as" });
}

/** Answers `(max-width: <n>em)` queries as a window this wide would, at 16px per em. */
function mockWindowWidth(widthPx: number) {
  jest.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const maxWidthEm = Number(query.match(/max-width:\s*([\d.]+)em/)?.[1]);
    return {
      matches: widthPx <= maxWidthEm * 16,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn<boolean, [Event]>(),
    };
  });
}
