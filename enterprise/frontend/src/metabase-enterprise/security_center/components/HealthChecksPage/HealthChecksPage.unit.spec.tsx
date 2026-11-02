import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupHealthChecksEndpoint,
  setupHealthChecksErrorEndpoint,
  setupRecheckHealthCheckEndpoint,
  setupRecheckHealthCheckErrorEndpoint,
  setupRecheckHealthChecksEndpoint,
  setupRecheckHealthChecksErrorEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type { HealthCheck, HealthCheckItem } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockVersion,
} from "metabase-types/api/mocks";
import {
  createMockHealthCheck,
  createMockHealthCheckItem,
} from "metabase-types/api/mocks/security-center";

import * as analytics from "../../analytics";

import { HealthChecksPage } from "./HealthChecksPage";

const FAILING_CHECK = createMockHealthCheck({
  id: "encryption-secret-key",
  title: "Encryption key",
  severity: "high",
  status: "fail",
  requires_restart: true,
  remediation: "Set the encryption key.",
  docs: { page: "databases/encrypting-details-at-rest" },
  items: [createMockHealthCheckItem({ status: "fail", message: "Not set" })],
});

const UNKNOWN_CHECK = createMockHealthCheck({
  id: "supported-version",
  title: "Supported version",
  severity: "high",
  status: "unknown",
  items: [
    createMockHealthCheckItem({
      status: "unknown",
      message: "No version info",
    }),
  ],
});

const PASSING_CHECK = createMockHealthCheck({
  id: "https-redirect",
  title: "HTTPS redirect",
  status: "pass",
  items: [
    createMockHealthCheckItem({ status: "pass", message: "Redirect is on" }),
  ],
});

interface SetupOpts {
  checks: HealthCheck[];
  showMetabaseLinks?: boolean;
}

const setup = async ({ checks, showMetabaseLinks = true }: SetupOpts) => {
  setupHealthChecksEndpoint(checks);

  const settings = mockSettings({
    version: createMockVersion({ tag: "v1.59.3" }),
    "show-metabase-links": showMetabaseLinks,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");

  renderWithProviders(
    <Route
      path="*"
      element={
        <>
          <HealthChecksPage />
          <UndoListing />
        </>
      }
    />,
    { withRouter: true, storeInitialState: { settings } },
  );

  await waitForLoaderToBeRemoved();
};

const getCardTitles = () =>
  screen
    .getAllByTestId("health-check-card")
    .map((card) => within(card).getByRole("heading").textContent);

const openGroup = async (name: RegExp) => {
  await userEvent.click(screen.getByRole("button", { name }));
};

describe("HealthChecksPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows how many checks pass", async () => {
    await setup({ checks: [FAILING_CHECK, UNKNOWN_CHECK, PASSING_CHECK] });

    expect(screen.getByText("1 of 3 checks pass")).toBeInTheDocument();
  });

  it("shows the all clear state only when every check passes", async () => {
    await setup({ checks: [PASSING_CHECK] });

    expect(screen.getByText("All security checks pass")).toBeInTheDocument();
    expect(screen.queryByTestId("health-check-card")).not.toBeInTheDocument();

    await openGroup(/Passed/);

    expect(screen.getByText("HTTPS redirect")).toBeInTheDocument();
  });

  it("does not show all clear when a check couldn't run", async () => {
    await setup({ checks: [UNKNOWN_CHECK, PASSING_CHECK] });

    expect(screen.getByText("1 of 2 checks pass")).toBeInTheDocument();
    expect(
      screen.queryByText("All security checks pass"),
    ).not.toBeInTheDocument();
  });

  it("opens failing checks and collapses the other groups", async () => {
    await setup({ checks: [FAILING_CHECK, UNKNOWN_CHECK, PASSING_CHECK] });

    expect(getCardTitles()).toEqual(["Encryption key"]);

    await openGroup(/Couldn't check/);

    expect(getCardTitles()).toEqual(["Encryption key", "Supported version"]);
    expect(screen.getByText("No version info")).toBeInTheDocument();
  });

  it("sorts checks by severity inside a group", async () => {
    await setup({
      checks: [
        { ...FAILING_CHECK, id: "low", title: "Low", severity: "low" },
        { ...FAILING_CHECK, id: "medium", title: "Medium", severity: "medium" },
        {
          ...FAILING_CHECK,
          id: "critical",
          title: "Critical",
          severity: "critical",
        },
        { ...FAILING_CHECK, id: "high", title: "High", severity: "high" },
      ],
    });

    expect(getCardTitles()).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  it("shows how to fix a failing check and that it needs a restart", async () => {
    await setup({ checks: [FAILING_CHECK] });

    expect(screen.getByText("Set the encryption key.")).toBeInTheDocument();
    expect(screen.getByText("Requires a restart")).toBeInTheDocument();
  });

  it("does not show how to fix a passing check", async () => {
    await setup({
      checks: [{ ...PASSING_CHECK, requires_restart: true }],
    });

    await openGroup(/Passed/);

    expect(screen.queryByText("How to fix")).not.toBeInTheDocument();
    expect(screen.queryByText("Requires a restart")).not.toBeInTheDocument();
  });

  it("lists failing items first and keeps passed items collapsed", async () => {
    await setup({
      checks: [
        {
          ...FAILING_CHECK,
          items: [
            createMockHealthCheckItem({ status: "pass", message: "Fine" }),
            createMockHealthCheckItem({ status: "unknown", message: "Unsure" }),
            createMockHealthCheckItem({ status: "fail", message: "Broken" }),
          ],
        },
      ],
    });

    const getItemTexts = () =>
      screen
        .getAllByTestId("health-check-item")
        .map((item) => item.textContent);

    expect(getItemTexts()).toEqual(["Broken", "Unsure"]);

    await userEvent.click(screen.getByRole("button", { name: /Passed \(1\)/ }));

    expect(getItemTexts()).toEqual(["Broken", "Unsure", "Fine"]);
  });

  it.each<{ checkId: string; item: HealthCheckItem; href: string }>([
    {
      checkId: "read-only-connections",
      item: {
        status: "fail",
        entity_type: "database",
        entity_id: 1,
        entity_name: "Warehouse",
      },
      href: "/admin/databases/1",
    },
    {
      checkId: "all-users-permissions",
      item: {
        status: "fail",
        entity_type: "collection",
        entity_id: "root",
        entity_name: "Our analytics",
      },
      href: "/admin/permissions/collections/root",
    },
    {
      checkId: "all-users-permissions",
      item: {
        status: "fail",
        entity_type: "group",
        entity_id: 1,
        entity_name: "All Users",
      },
      href: "/admin/permissions/data/group/1",
    },
  ])(
    "links a $item.entity_type of $checkId to its page",
    async ({ checkId, item, href }) => {
      await setup({
        checks: [{ ...FAILING_CHECK, id: checkId, items: [item] }],
      });

      expect(
        screen.getByRole("link", { name: item.entity_name }),
      ).toHaveAttribute("href", href);
    },
  );

  it("shows the name of an object without a page as plain text", async () => {
    await setup({
      checks: [
        {
          ...FAILING_CHECK,
          id: "some-other-check",
          items: [
            createMockHealthCheckItem({
              status: "fail",
              entity_type: "database",
              entity_id: 1,
              entity_name: "Warehouse",
            }),
          ],
        },
      ],
    });

    expect(screen.getByText("Warehouse")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Warehouse" }),
    ).not.toBeInTheDocument();
  });

  it("links to the docs of the instance version", async () => {
    await setup({ checks: [FAILING_CHECK] });

    expect(screen.getByRole("link", { name: "Read the docs" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/docs/v0.59/databases/encrypting-details-at-rest",
      ),
    );
  });

  it("hides the docs link on white-label instances", async () => {
    await setup({ checks: [FAILING_CHECK], showMetabaseLinks: false });

    expect(
      screen.queryByRole("link", { name: "Read the docs" }),
    ).not.toBeInTheDocument();
  });

  it("re-checks one check and shows the returned result", async () => {
    const track = jest.spyOn(analytics, "trackHealthCheckRecheckClicked");
    setupRecheckHealthCheckEndpoint(FAILING_CHECK.id, {
      ...FAILING_CHECK,
      status: "pass",
      items: [
        createMockHealthCheckItem({ status: "pass", message: "Key is set" }),
      ],
    });
    await setup({ checks: [FAILING_CHECK, PASSING_CHECK] });

    await userEvent.click(
      screen.getByRole("button", { name: "sync icon Re-check" }),
    );

    expect(await screen.findByText("2 of 2 checks pass")).toBeInTheDocument();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(FAILING_CHECK.id);
  });

  it("re-checks all checks and shows the returned results", async () => {
    const track = jest.spyOn(analytics, "trackAllHealthChecksRecheckClicked");
    setupRecheckHealthChecksEndpoint([PASSING_CHECK]);
    await setup({ checks: [FAILING_CHECK, PASSING_CHECK] });

    await userEvent.click(
      screen.getByRole("button", { name: "sync icon Re-check all" }),
    );

    expect(
      await screen.findByText("All security checks pass"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/security-center/health-checks/recheck",
      ),
    ).toHaveLength(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("keeps the check and shows an error when a re-check fails", async () => {
    setupRecheckHealthCheckErrorEndpoint(FAILING_CHECK.id);
    await setup({ checks: [FAILING_CHECK] });

    await userEvent.click(
      screen.getByRole("button", { name: "sync icon Re-check" }),
    );

    expect(
      await screen.findByText("Failed to re-check. Please try again."),
    ).toBeInTheDocument();
    expect(getCardTitles()).toEqual(["Encryption key"]);
  });

  it("shows an error when re-check all fails", async () => {
    setupRecheckHealthChecksErrorEndpoint();
    await setup({ checks: [FAILING_CHECK] });

    await userEvent.click(
      screen.getByRole("button", { name: "sync icon Re-check all" }),
    );

    expect(
      await screen.findByText("Failed to re-check. Please try again."),
    ).toBeInTheDocument();
  });

  it("tracks the page view", async () => {
    const track = jest.spyOn(analytics, "trackHealthChecksPageViewed");
    await setup({ checks: [PASSING_CHECK] });

    expect(track).toHaveBeenCalledTimes(1);
  });

  it("shows an error when checks can't be loaded", async () => {
    setupHealthChecksErrorEndpoint();
    renderWithProviders(<Route path="*" element={<HealthChecksPage />} />, {
      withRouter: true,
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });
});
