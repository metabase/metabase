import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGroupsEndpoint,
  setupPermissionPreviewAttributesEndpoint,
  setupPermissionPreviewCollectionsEndpoint,
  setupPermissionPreviewPrincipalsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUserListResult } from "metabase-types/api/mocks";

import type { PreviewSessionResponse } from "../api";

import { TroubleshootPage } from "./TroubleshootPage";

const SANDY_SESSION: PreviewSessionResponse = {
  preview_id: "preview-1",
  user_id: 3,
  user_name: "Sandy Sales",
  principal_name: "Sandy Sales",
  attributes: {},
  session_token: "token-1",
  expires_at: 4102444800,
};

describe("TroubleshootPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("says whose view is loading while the frame loads", async () => {
    setup({});

    expect(
      await screen.findByText("Loading Sandy Sales's view…"),
    ).toBeInTheDocument();
  });

  it("keeps Explain access in words and the whole sentence on a tablet, where the band wraps instead", async () => {
    setup({ isNarrow: true });

    expect(
      await screen.findByRole("button", { name: "Sandy Sales" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Previewing as" }),
    ).toHaveTextContent("Previewing as Sandy Sales");
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Explain access" }),
    ).toHaveTextContent("Explain access");
  });

  it("gives the band the mode bar spacing: 16px sides, 8px above and below, and 32px buttons", async () => {
    setup({});

    const band = await screen.findByRole("status", { name: "Previewing as" });
    // jsdom can't resolve var(), so the props are read from the inline style they render
    const bandStyle = band.getAttribute("style");
    expect(bandStyle).toContain("padding-left: var(--mantine-spacing-lg)");
    expect(bandStyle).toContain("padding-right: var(--mantine-spacing-lg)");
    expect(bandStyle).toContain("padding-block: var(--mantine-spacing-sm)");
    for (const name of [
      "Back to all collections",
      "Explain access",
      "Open in new tab",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveStyle(
        "--button-height: var(--button-height-md)",
      );
    }
  });

  it("says what Read-only means in its tooltip, without Audited next to the name", async () => {
    setup({});

    await userEvent.hover(await screen.findByText("Read-only"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Nothing you change here is saved. Previews are recorded in the audit log.",
    );
    expect(screen.queryByText(/Audited/)).not.toBeInTheDocument();
  });

  it("shows the user's email, groups and every user attribute on hovering their name", async () => {
    setup({});

    await userEvent.hover(
      await screen.findByRole("button", { name: "Sandy Sales" }),
    );

    expect(await screen.findByText("sandy@example.com")).toBeInTheDocument();
    expect(screen.getByText("All internal users, Sales")).toBeInTheDocument();
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText("Gizmo")).toBeInTheDocument();
    expect(screen.getByText("country")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
  });

  it("goes back to all collections from an item the person may not be able to open", async () => {
    setup({});
    const address = await screen.findByRole("textbox", { name: "Address" });
    await userEvent.clear(address);
    await userEvent.type(address, "/collection/42{Enter}");
    expect(address).toHaveValue("/collection/42");

    await userEvent.click(
      screen.getByRole("button", { name: "Back to all collections" }),
    );

    expect(address).toHaveValue("/");
  });

  it("keeps previewing the same person while the sidebar switches to the Group list", async () => {
    setup({});
    await screen.findByRole("button", { name: "Sandy Sales" });

    await userEvent.click(screen.getByText("Group"));

    expect(
      await screen.findByPlaceholderText("Search for a group"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Previewing as" }),
    ).toHaveTextContent("Previewing as Sandy Sales");
  });

  it("offers Open in new tab as one button, with no more-options menu", async () => {
    setup({});

    expect(
      await screen.findByRole("button", { name: "Open in new tab" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More preview options" }),
    ).not.toBeInTheDocument();
  });
});

type SetupOpts = {
  /** Below 1280px wide, where the bands used to shorten their controls. */
  isNarrow?: boolean;
};

function setup({ isNarrow = false }: SetupOpts) {
  jest.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: isNarrow,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  setupUsersEndpoints([
    createMockUserListResult({ id: 3, common_name: "Sandy Sales" }),
  ]);
  setupGroupsEndpoint([]);
  setupPermissionPreviewAttributesEndpoint([]);
  setupPermissionPreviewPrincipalsEndpoint({
    users: [
      {
        id: 3,
        name: "Sandy Sales",
        detail: null,
        member_count: null,
        tenant_side: false,
        email: "sandy@example.com",
        group_ids: [1, 2],
      },
    ],
    groups: [],
    tenants: [],
  });
  setupPermissionPreviewCollectionsEndpoint("default", {
    principal: {
      type: "user",
      id: 3,
      name: "Sandy Sales",
      detail: null,
      member_count: null,
      superuser: false,
      tenant_side: false,
      attributes: { category: "Gizmo", country: "US" },
      groups: [
        { id: 1, name: "All internal users" },
        { id: 2, name: "Sales" },
      ],
    },
    applies: true,
    reason: null,
    collections: [],
  });
  fetchMock.post(
    "path:/api/ee/permission_debug/preview/session",
    SANDY_SESSION,
  );
  // the page ends the preview when the test unmounts it
  fetchMock.post("path:/api/ee/permission_debug/preview/end", 204);

  renderWithProviders(
    <>
      {/* a tab switch used to navigate here, which has to render a page for the test to reach its assertion */}
      <Route
        path="/admin/permissions/troubleshoot/:principalType"
        element={<TroubleshootPage />}
      />
      <Route
        path="/admin/permissions/troubleshoot/:principalType/:principalId"
        element={<TroubleshootPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute: "/admin/permissions/troubleshoot/user/3",
    },
  );
}
