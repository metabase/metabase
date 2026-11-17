import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGroupsEndpoint,
  setupPermissionPreviewAttributesEndpoint,
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
      await screen.findByText("Viewing as Sandy Sales"),
    ).toBeInTheDocument();
    expect(screen.getByText("· Read-only · Audited")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Explain access" }),
    ).toHaveTextContent("Explain access");
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
  fetchMock.post(
    "path:/api/ee/permission_debug/preview/session",
    SANDY_SESSION,
  );
  // the page ends the preview when the test unmounts it
  fetchMock.post("path:/api/ee/permission_debug/preview/end", 204);

  renderWithProviders(
    <Route
      path="/admin/permissions/troubleshoot/:principalType/:principalId"
      element={<TroubleshootPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/admin/permissions/troubleshoot/user/3",
    },
  );
}
