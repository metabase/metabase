import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupSettingsEndpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { SetupGuideChecklist } from "metabase/embedding/setup-guide/api/setup-guide";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHubGetStartedPage } from "./EmbeddingHubGetStartedPage";

const THEME_CARD = "Create a custom theme";
const AI_CARD = "Configure AI";
const TENANTS_CARD = "Configure data permissions and tenants";
const SSO_CARD = "Set up SSO";
const PRODUCTION_CARD = "Embed in production with SSO";

interface SetupOpts {
  hasSimpleEmbedding?: boolean;
  hasSsoJwt?: boolean;
  hasTenants?: boolean;
  checklist?: Partial<SetupGuideChecklist>;
  isLlmConfigured?: boolean;
  isEmbeddedMetabotEnabled?: boolean;
}

function setup({
  hasSimpleEmbedding = false,
  hasSsoJwt = false,
  hasTenants = false,
  checklist = {},
  isLlmConfigured = false,
  isEmbeddedMetabotEnabled = true,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
      sso_jwt: hasSsoJwt,
      tenants: hasTenants,
    }),
    "llm-metabot-configured?": isLlmConfigured,
    "embedded-metabot-enabled?": isEmbeddedMetabotEnabled,
  });

  fetchMock.get("path:/api/embedding-hub/checklist", {
    checklist,
    "data-isolation-strategy": null,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupSearchEndpoints([]);
  setupDatabaseListEndpoint([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupTokenStatusEndpoint({ valid: true });

  // Settings before plugins: the shared checklist drops the tenants step when
  // PLUGIN_TENANTS.isEnabled is false, and that registration reads the mock.
  const storeSettings = mockSettings(settings);
  setupEnterprisePlugins();

  return renderWithProviders(
    <Route
      path="/embedding/get-started"
      element={<EmbeddingHubGetStartedPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/embedding/get-started",
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

/**
 * The card whose own subtree carries the given title.
 *
 * An unlocked card is a real control -- an anchor or a button -- with the
 * title as its accessible name, so it is found by role. A locked card is
 * deliberately inert: no link, no button, no role at all, since it is not
 * meant to be reachable. There is nothing to query by role there, so it
 * falls back to the container testid, scoped by the title text within it.
 */
function queryCard(title: string) {
  const control =
    screen.queryByRole("link", { name: title }) ??
    screen.queryByRole("button", { name: title });

  if (control) {
    return control;
  }

  return (
    screen
      .queryAllByTestId("embedding-hub-checklist-card")
      .find((card) => within(card).queryByText(title) != null) ?? null
  );
}

function getCard(title: string) {
  const card = queryCard(title);

  if (!card) {
    throw new Error(`No checklist card found for "${title}"`);
  }

  return card;
}

function isLocked(title: string) {
  return getCard(title).getAttribute("aria-disabled") === "true";
}

/** The number shown on a card's badge, or null once the step is complete. */
function stepNumber(title: string) {
  const badge = within(getCard(title)).queryByText(/^\d+$/);
  return badge ? Number(badge.textContent) : null;
}

describe("EmbeddingHubGetStartedPage", () => {
  describe("per-feature locking", () => {
    it("locks every Fine-tune step when the instance licenses nothing", async () => {
      setup();

      expect(await screen.findByText(SSO_CARD)).toBeInTheDocument();

      // AI is excluded on purpose: it needs no paid feature, so it never locks.
      [TENANTS_CARD, SSO_CARD, PRODUCTION_CARD, THEME_CARD].forEach((title) => {
        expect(isLocked(title)).toBe(true);
      });
    });

    it("unlocks only the steps whose own feature is licensed", async () => {
      // An instance can license SSO without modular embedding -- an ordinary
      // Starter-plus-SSO shape -- and its SSO steps must not read as
      // unavailable.
      setup({ hasSsoJwt: true });

      expect(await screen.findByText(SSO_CARD)).toBeInTheDocument();

      expect(isLocked(SSO_CARD)).toBe(false);
      expect(isLocked(TENANTS_CARD)).toBe(true);
      expect(isLocked(THEME_CARD)).toBe(true);
    });

    it("unlocks the tenants step on its own feature", async () => {
      setup({ hasTenants: true });

      expect(await screen.findByText(TENANTS_CARD)).toBeInTheDocument();
      expect(isLocked(TENANTS_CARD)).toBe(false);
      expect(isLocked(SSO_CARD)).toBe(true);
    });

    it("unlocks the theme step on embedding_simple", async () => {
      setup({ hasSimpleEmbedding: true });

      expect(await screen.findByText(THEME_CARD)).toBeInTheDocument();
      expect(isLocked(THEME_CARD)).toBe(false);
      expect(isLocked(SSO_CARD)).toBe(true);
    });

    it("never locks the AI step, which needs no paid feature", async () => {
      setup();

      expect(await screen.findByText(AI_CARD)).toBeInTheDocument();
      expect(isLocked(AI_CARD)).toBe(false);
    });

    it("still renders the tenants step the shared checklist omitted", async () => {
      // Below the paywall `useGetSetupGuideSteps` drops the step entirely, so
      // the card has no action. The design shows the whole ladder including the
      // rungs you have not bought, so a locked step renders anyway.
      setup({ hasTenants: false });

      expect(await screen.findByText(TENANTS_CARD)).toBeInTheDocument();
      expect(isLocked(TENANTS_CARD)).toBe(true);
      expect(getCard(TENANTS_CARD).tagName).not.toBe("A");
    });
  });

  describe("the production-embed prerequisite", () => {
    it("names the prerequisite once SSO is licensed but not configured", async () => {
      setup({ hasSsoJwt: true, checklist: { "sso-configured": false } });

      expect(await screen.findByText(PRODUCTION_CARD)).toBeInTheDocument();
      expect(isLocked(PRODUCTION_CARD)).toBe(true);

      // The reason is a tooltip, so it is in the DOM only once hovered.
      await userEvent.hover(getCard(PRODUCTION_CARD));

      expect(
        await screen.findByText("Set up SSO to unlock"),
      ).toBeInTheDocument();
    });

    it("names no prerequisite when SSO is not licensed at all", async () => {
      // Promising a step is one action away, to someone who cannot reach it,
      // is worse than saying nothing -- the banner above already names the
      // price.
      setup({ hasSsoJwt: false });

      expect(await screen.findByText(PRODUCTION_CARD)).toBeInTheDocument();
      expect(isLocked(PRODUCTION_CARD)).toBe(true);

      await userEvent.hover(getCard(PRODUCTION_CARD));

      expect(
        screen.queryByText("Set up SSO to unlock"),
      ).not.toBeInTheDocument();
    });

    it("unlocks once SSO is both licensed and configured", async () => {
      setup({
        hasSsoJwt: true,
        checklist: {
          "sso-configured": true,
          "sso-auth-manual-tested": true,
        },
      });

      await screen.findByText(SSO_CARD);

      expect(screen.getByText(PRODUCTION_CARD)).toBeInTheDocument();
      expect(isLocked(PRODUCTION_CARD)).toBe(false);
      expect(
        screen.queryByText("Set up SSO to unlock"),
      ).not.toBeInTheDocument();
    });
  });

  describe("the AI card's done state", () => {
    // Which settings make it done is the backend's business now -- it reports
    // `configure-ai`, and the card just renders what the checklist says.
    it("is not done while the checklist says it is not", async () => {
      setup({ checklist: { "configure-ai": false } });

      expect(await screen.findByText(AI_CARD)).toBeInTheDocument();
      expect(
        within(getCard(AI_CARD)).queryByLabelText(/complete/),
      ).not.toBeInTheDocument();
    });

    it("is done when the checklist says so, and links out to admin", async () => {
      setup({ checklist: { "configure-ai": true } });

      // Before the checklist loads, the card is still the unconfigured
      // (button) variant -- querying by text alone would resolve against
      // that transient render and hold a stale node once it is swapped for
      // the link. Querying by the link role waits for the swap itself.
      const card = await screen.findByRole("link", { name: AI_CARD });

      expect(within(card).getByLabelText(/complete/)).toBeInTheDocument();

      // Configured, the card links out rather than reopening the modal.
      expect(card).toHaveAttribute("href", expect.stringContaining("/admin"));
    });

    it("opens the provider modal while unconfigured", async () => {
      setup({ checklist: { "configure-ai": false } });

      await userEvent.click(await screen.findByText(AI_CARD));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("the paywall banner", () => {
    it("replaces the Fine-tune subtitle rather than stacking with it", async () => {
      setup({ hasSimpleEmbedding: false });

      expect(
        await screen.findByText(
          "Upgrade to Metabase Pro to configure advanced options.",
        ),
      ).toBeInTheDocument();

      expect(
        screen.queryByText(
          "If you have a more sophisticated setup in mind, with many users and tenants, then keep going.",
        ),
      ).not.toBeInTheDocument();
    });

    it("shows the subtitle and no banner above the paywall", async () => {
      setup({ hasSimpleEmbedding: true });

      expect(
        await screen.findByText(
          "If you have a more sophisticated setup in mind, with many users and tenants, then keep going.",
        ),
      ).toBeInTheDocument();

      expect(
        screen.queryByText(
          "Upgrade to Metabase Pro to configure advanced options.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("useful links", () => {
    it("tags all three with the hub's docs campaign", async () => {
      setup();

      const links = ["Embedding methods", "Demo", "Documentation"];

      for (const label of links) {
        const link = await screen.findByRole("link", {
          name: new RegExp(label),
        });
        expect(link).toHaveAttribute(
          "href",
          expect.stringContaining("utm_campaign=embedding_hub"),
        );
      }
    });

    it("gives each link its own utm_content so clicks are attributable", async () => {
      setup();

      const contents = await Promise.all(
        ["Embedding methods", "Demo", "Documentation"].map(async (label) => {
          const link = await screen.findByRole("link", {
            name: new RegExp(label),
          });
          return new URL(link.getAttribute("href") ?? "").searchParams.get(
            "utm_content",
          );
        }),
      );

      expect(new Set(contents).size).toBe(contents.length);
    });
  });

  describe("the first-embed steps", () => {
    it("renders all three unlocked on every edition", async () => {
      setup();

      const titles = [
        "Connect a database",
        "Create a dashboard",
        "Get embed snippet",
      ];

      for (const title of titles) {
        expect(await screen.findByText(title)).toBeInTheDocument();
        expect(isLocked(title)).toBe(false);
      }
    });

    it("marks a completed step done", async () => {
      setup({ checklist: { "add-data": true } });

      expect(await screen.findByText("Connect a database")).toBeInTheDocument();
      expect(
        within(getCard("Connect a database")).getByLabelText(/complete/),
      ).toBeInTheDocument();
      expect(
        within(getCard("Create a dashboard")).queryByLabelText(/complete/),
      ).not.toBeInTheDocument();
    });
  });

  it("does not render a Fine-tune card the checklist omits and nothing locks", async () => {
    // Guards the other half of the rule: a missing action only removes the card
    // when the step is not locked.
    setup({ hasTenants: true });

    await screen.findByText(TENANTS_CARD);
    expect(queryCard(TENANTS_CARD)).toBeInTheDocument();
  });

  describe("step order", () => {
    it("promotes AI to step 4 without modular embedding", async () => {
      setup({ hasSimpleEmbedding: false });

      expect(await screen.findByText(AI_CARD)).toBeInTheDocument();

      // AI is the one advanced step still reachable, so it joins the first
      // section and pushes the Fine-tune steps down by one.
      expect(stepNumber(AI_CARD)).toBe(4);
      expect(stepNumber(SSO_CARD)).toBe(6);
      expect(stepNumber(THEME_CARD)).toBe(8);
    });

    it("leaves AI last once modular embedding is licensed", async () => {
      setup({ hasSimpleEmbedding: true });

      expect(await screen.findByText(AI_CARD)).toBeInTheDocument();

      expect(stepNumber(SSO_CARD)).toBe(5);
      expect(stepNumber(THEME_CARD)).toBe(7);
      expect(stepNumber(AI_CARD)).toBe(8);
    });
  });

  describe("Pro upsell banner", () => {
    it("shows the banner when the instance lacks modular embedding", async () => {
      setup({ hasSimpleEmbedding: false });

      expect(
        await screen.findByRole("heading", {
          name: "Upgrade to Metabase Pro to configure advanced options.",
        }),
      ).toBeInTheDocument();
    });

    it("hides the banner once modular embedding is licensed", async () => {
      setup({ hasSimpleEmbedding: true });

      await screen.findByText(THEME_CARD);
      expect(
        screen.queryByRole("heading", {
          name: "Upgrade to Metabase Pro to configure advanced options.",
        }),
      ).not.toBeInTheDocument();
    });
  });
});
