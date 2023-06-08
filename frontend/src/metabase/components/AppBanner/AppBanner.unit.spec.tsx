/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "assertBanner"] }] */
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { State } from "metabase-types/store";

import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { AppBanner } from "./AppBanner";

interface SetupOpts {
  shouldRenderPastDueBanner: boolean;
  shouldRenderUnpaidBanner: boolean;
  shouldRenderDatabasePromptBanner: boolean;
}

function setup({
  shouldRenderPastDueBanner,
  shouldRenderUnpaidBanner,
  shouldRenderDatabasePromptBanner,
}: SetupOpts) {
  renderWithProviders(<Route path="*" component={AppBanner} />, {
    initialRoute: "/",
    storeInitialState: createStateForConfig({
      shouldRenderPastDueBanner,
      shouldRenderUnpaidBanner,
      shouldRenderDatabasePromptBanner,
    }),
    withRouter: true,
  });
}

function createStateForConfig({
  shouldRenderPastDueBanner,
  shouldRenderUnpaidBanner,
  shouldRenderDatabasePromptBanner,
}: SetupOpts): State {
  let isAdmin = false;
  const tokenStatus = {
    status: "Token is valid.",
  };
  const features = {
    sso: false,
  };

  if (shouldRenderPastDueBanner) {
    tokenStatus.status = "past-due";
    isAdmin = true;
  }

  if (shouldRenderUnpaidBanner) {
    tokenStatus.status = "unpaid";
    isAdmin = true;
  }

  if (shouldRenderDatabasePromptBanner) {
    isAdmin = true;
    features.sso = true;
    setupDatabasesEndpoints([createSampleDatabase()]);
  }

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: createMockSettingsState({
      "token-features": createMockTokenFeatures(features),
      "token-status": tokenStatus,
    }),
  });

  return state;
}

describe("AppBanner", () => {
  it.each([
    {
      shouldRenderPastDueBanner: false,
      shouldRenderUnpaidBanner: false,
      shouldRenderDatabasePromptBanner: false,
      renderingBanner: "Nothing",
    },
    {
      shouldRenderPastDueBanner: true,
      shouldRenderUnpaidBanner: false,
      shouldRenderDatabasePromptBanner: false,
      renderingBanner: "Past-due banner",
    },
    {
      shouldRenderPastDueBanner: false,
      shouldRenderUnpaidBanner: true,
      shouldRenderDatabasePromptBanner: false,
      renderingBanner: "Unpaid banner",
    },
    {
      shouldRenderPastDueBanner: false,
      shouldRenderUnpaidBanner: false,
      shouldRenderDatabasePromptBanner: true,
      renderingBanner: "Database prompt banner",
    },
    {
      shouldRenderPastDueBanner: true,
      shouldRenderUnpaidBanner: false,
      shouldRenderDatabasePromptBanner: true,
      renderingBanner: "Past-due banner",
    },
    {
      shouldRenderPastDueBanner: false,
      shouldRenderUnpaidBanner: true,
      shouldRenderDatabasePromptBanner: true,
      renderingBanner: "Unpaid banner",
    },
  ] as const)(
    "should render $renderingBanner when should render past-due banner: $shouldRenderPastDueBanner, should render unpaid banner: $shouldRenderUnpaidBanner, should render database prompt banner: $shouldRenderDatabasePromptBanner",
    async ({
      shouldRenderPastDueBanner,
      shouldRenderUnpaidBanner,
      shouldRenderDatabasePromptBanner,
      renderingBanner,
    }) => {
      setup({
        shouldRenderPastDueBanner,
        shouldRenderUnpaidBanner,
        shouldRenderDatabasePromptBanner,
      });

      await assertBanner(renderingBanner);
    },
  );
});

async function assertBanner(
  renderingBanner:
    | "Nothing"
    | "Past-due banner"
    | "Unpaid banner"
    | "Database prompt banner",
) {
  if (renderingBanner === "Nothing") {
    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
    return;
  }

  if (renderingBanner === "Past-due banner") {
    expect(
      screen.getByText(/We couldn't process payment for your account\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
    return;
  }
  if (renderingBanner === "Unpaid banner") {
    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
    return;
  }

  if (renderingBanner === "Database prompt banner") {
    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).toBeInTheDocument();
    return;
  }
}
