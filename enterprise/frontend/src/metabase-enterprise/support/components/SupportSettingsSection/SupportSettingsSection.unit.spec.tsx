import dayjs from "dayjs";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCurrentAccessGrantEndpoint,
  setupListAccessGrantsEndpoint,
  setupListAccessGrantsEndpointWithError,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import { createMockAccessGrant } from "metabase-types/api/mocks";

import { GrantAccessModal } from "./GrantAccessModal";
import { SupportSettingsSection } from "./SupportSettingsSection";

const setup = () => {
  return renderWithProviders(
    <>
      <Route
        path="/admin/tools/help"
        component={() => <SupportSettingsSection />}
      />
      <Route
        path="/admin/tools/help/grant-access"
        component={() => <GrantAccessModal onClose={jest.fn()} />}
      />
    </>,
    { withRouter: true, initialRoute: "/admin/tools/help" },
  );
};

describe("SupportSettingsSection", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.spyOn(console, "error").mockRestore();
    fetchMock.clearHistory();
  });

  describe("'Request a helping hand' button", () => {
    it("should be enabled when there is no current access grant", async () => {
      setupCurrentAccessGrantEndpoint(null);
      setupListAccessGrantsEndpoint([]);

      setup();

      const button = await screen.findByRole("button", {
        name: "Request a helping hand",
      });
      expect(button).toBeEnabled();
    });

    it("should be disabled when there is a current access grant", async () => {
      const currentGrant = createMockAccessGrant({
        id: 1,
        grant_start_timestamp: dayjs().subtract(1, "hour").toISOString(),
        grant_end_timestamp: dayjs().add(23, "hours").toISOString(),
        revoked_at: null,
      });

      setupCurrentAccessGrantEndpoint(currentGrant);
      setupListAccessGrantsEndpoint([currentGrant]);

      setup();

      const button = await screen.findByRole("button", {
        name: "Request a helping hand",
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute(
        "title",
        "You already have an active access grant",
      );
    });
  });

  it("should display error message when access grant list endpoint fails", async () => {
    const errorMessage = "Failed to load access grants";
    setupCurrentAccessGrantEndpoint(null);
    setupListAccessGrantsEndpointWithError(errorMessage);

    setup();

    expect(
      await screen.findByRole("heading", { name: errorMessage }),
    ).toBeInTheDocument();
  });

  it("can click the 'Request a helping hand' button to show the grant access modal", async () => {
    setupCurrentAccessGrantEndpoint(null);
    setupListAccessGrantsEndpoint([]);

    setup();

    const button = await screen.findByRole("button", {
      name: "Request a helping hand",
    });

    fireEvent.click(button);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Grant Access?",
      }),
    ).toBeInTheDocument();
  });
});
