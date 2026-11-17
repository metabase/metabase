import userEvent from "@testing-library/user-event";

import {
  setupPermissionPreviewAttributesEndpoint,
  setupPermissionPreviewPrincipalsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { PreviewBanner } from "./PreviewBanner";
import type { PreviewState } from "./preview-state";

const STATE: PreviewState = {
  userId: 2,
  userName: "Sandy Sales",
  principalType: "user",
  principalId: 2,
  principalName: "Sandy Sales",
  attributes: {},
  returnPath: "/admin/permissions/data",
};

describe("PreviewBanner", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
};

async function setup({ widthPx }: SetupOpts) {
  mockWindowWidth(widthPx);
  setupPermissionPreviewAttributesEndpoint([]);
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
    groups: [],
    tenants: [],
  });

  renderWithProviders(<PreviewBanner state={STATE} />, { withRouter: true });
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
