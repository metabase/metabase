import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { dayjs } from "metabase/dayjs";
import { reinitialize } from "metabase/plugins";
import type { TokenFeatures } from "metabase-types/api";

import {
  CREATED_GRANT_ID,
  HOSTING_ENV,
  type SetupOpts,
  VERSION_TAG,
  setup as baseSetup,
} from "./setup";

const STARTER_FEATURES: Partial<TokenFeatures> = {
  hosting: true,
  "support-users": true,
};

const PRO_CLOUD_FEATURES: Partial<TokenFeatures> = {
  hosting: true,
  "support-users": true,
  sandboxes: true,
  whitelabel: true,
  audit_app: true,
};

const PRO_SELF_HOSTED_FEATURES: Partial<TokenFeatures> = {
  sandboxes: true,
  whitelabel: true,
  audit_app: true,
};

function setup(opts: SetupOpts = {}) {
  return baseSetup({ isEnterprise: true, isPaidPlan: true, ...opts });
}

async function findHelpingHandButton() {
  return screen.findByRole("button", { name: "Request a helping hand" });
}

function getDiagFromHref(href: string | null): unknown {
  const diag = new URL(String(href)).searchParams.get("diag");
  return JSON.parse(String(diag));
}

describe("Help (EE)", () => {
  afterEach(() => {
    reinitialize();
  });

  it("does not show the `Helping hand` section without a token", async () => {
    setup({ isPaidPlan: false });

    expect(
      await screen.findByRole("heading", { name: "Diagnostic info" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Helping hand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request a helping hand" }),
    ).not.toBeInTheDocument();
  });

  describe("on a paid plan without the support-users feature", () => {
    it("links `Get help` to the premium help page with the instance version and diagnostic info", async () => {
      setup({ tokenFeatures: PRO_SELF_HOSTED_FEATURES });

      const link = await screen.findByRole("link", { name: /Get help/ });
      const href = link.getAttribute("href");
      expect(href).toMatch(
        new RegExp(
          `^https://www\\.metabase\\.com/help-premium\\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${VERSION_TAG}&diag=%7B.+%7D$`,
        ),
      );
      await waitFor(() =>
        expect(
          getDiagFromHref(
            screen.getByRole("link", { name: /Get help/ }).getAttribute("href"),
          ),
        ).toMatchObject({
          "hosting-env": HOSTING_ENV,
          "browser-info": expect.objectContaining({
            userAgent: navigator.userAgent,
          }),
        }),
      );
    });

    it("does not show the `Helping hand` section", async () => {
      setup({ tokenFeatures: PRO_SELF_HOSTED_FEATURES });

      expect(
        await screen.findByRole("heading", { name: "Diagnostic info" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Helping hand" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Request a helping hand" }),
      ).not.toBeInTheDocument();
    });
  });

  it.each([
    { plan: "starter", tokenFeatures: STARTER_FEATURES },
    { plan: "pro-cloud", tokenFeatures: PRO_CLOUD_FEATURES },
  ])("shows the `Helping hand` section on $plan", async ({ tokenFeatures }) => {
    setup({ tokenFeatures });

    expect(
      await screen.findByRole("heading", { name: "Helping hand" }),
    ).toBeInTheDocument();
    expect(await findHelpingHandButton()).toBeEnabled();
  });

  it("creates an access grant with a duration, ticket and notes, allows only one active grant, and revokes it", async () => {
    setup({ tokenFeatures: PRO_CLOUD_FEATURES });

    const requestButton = await findHelpingHandButton();
    expect(requestButton).toBeEnabled();
    expect(
      screen.queryByTestId("access-grant-list-table"),
    ).not.toBeInTheDocument();

    await userEvent.click(requestButton);

    const modal = await screen.findByTestId("grant-access-modal");
    expect(
      within(modal).getByRole("heading", { name: "Grant Access?" }),
    ).toBeInTheDocument();

    await userEvent.click(within(modal).getByLabelText(/Access duration/));
    await userEvent.click(
      await screen.findByRole("option", { name: "48 hours" }),
    );
    await userEvent.type(within(modal).getByLabelText("Ticket"), "TICKET-999");
    await userEvent.type(within(modal).getByLabelText("Notes"), "Custom notes");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Grant access" }),
    );

    const toast = await screen.findByTestId("toast-undo");
    expect(
      within(toast).getByText("Access grant created successfully"),
    ).toBeInTheDocument();

    const createCalls = fetchMock.callHistory.calls(
      "path:/api/ee/support-access-grant",
      { method: "POST" },
    );
    expect(createCalls).toHaveLength(1);
    const createBody: unknown = JSON.parse(String(createCalls[0].options.body));
    expect(createBody).toEqual({
      grant_duration_minutes: 48 * 60,
      ticket_number: "TICKET-999",
      notes: "Custom notes",
    });

    await waitFor(() =>
      expect(
        screen.queryByTestId("grant-access-modal"),
      ).not.toBeInTheDocument(),
    );

    const table = await screen.findByTestId("access-grant-list-table");
    const [, ...bodyRows] = within(table).getAllByRole("row");
    expect(bodyRows).toHaveLength(1);
    expect(
      within(table).getByRole("cell", {
        name: new RegExp(dayjs().format("MMM D, YYYY")),
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "TICKET-999" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Custom notes" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("48 hours left")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Request a helping hand" }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByText("You can only have one active request at a time"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(table).getByRole("button", { name: "Revoke access grant" }),
    );
    const confirmModal = await screen.findByRole("dialog", {
      name: "Revoke access grant?",
    });
    await userEvent.click(
      within(confirmModal).getByRole("button", { name: "Revoke" }),
    );

    expect(
      await screen.findByText("Access grant revoked successfully"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        `path:/api/ee/support-access-grant/${CREATED_GRANT_ID}/revoke`,
        { method: "PUT" },
      ),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Request a helping hand" }),
      ).toBeEnabled(),
    );
  });
});
