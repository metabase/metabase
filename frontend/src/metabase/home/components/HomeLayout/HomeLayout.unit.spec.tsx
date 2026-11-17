import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupEnginesEndpoint,
  setupSetupGuideChecklistEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  EmbeddingHomepageStatus,
  EnterpriseSettings,
  IllustrationSettingValue,
  Settings,
  User,
} from "metabase-types/api";
import {
  createMockEngines,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { HomeLayout } from "./HomeLayout";

jest.mock("metabase/common/components/LighthouseIllustration", () => ({
  LighthouseIllustration: () => <div data-testid="lighthouse-illustration" />,
}));

const ILLUSTRATION_URL =
  "api/session/illustration/landing-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  currentUser?: User;
  landingPageIllustration?: IllustrationSettingValue;
  embeddingHomepage?: EmbeddingHomepageStatus;
  hasSimpleEmbedding?: boolean;
}

const setup = ({
  currentUser,
  landingPageIllustration,
  embeddingHomepage,
  hasSimpleEmbedding = false,
}: SetupOpts = {}) => {
  const settings: Partial<Settings & EnterpriseSettings> = {
    "token-features": createMockTokenFeatures({
      whitelabel: Boolean(landingPageIllustration),
      embedding_simple: hasSimpleEmbedding,
    }),
  };
  if (landingPageIllustration) {
    settings["landing-page-illustration"] = landingPageIllustration;
    settings["landing-page-illustration-custom"] = ILLUSTRATION_URL;
  }
  if (embeddingHomepage) {
    settings["embedding-homepage"] = embeddingHomepage;
  }

  // Settings before plugins: the plugins read the settings when they register.
  const state = createMockState({
    currentUser,
    settings: mockSettings(settings),
  });
  if (landingPageIllustration) {
    setupEnterpriseOnlyPlugin("whitelabel");
  }
  if (embeddingHomepage) {
    setupDatabaseListEndpoint([]);
    setupEnginesEndpoint(createMockEngines());
    setupSetupGuideChecklistEndpoint();
  }

  renderWithProviders(<HomeLayout />, {
    storeInitialState: state,
  });
};

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup({ currentUser: createMockUser({ first_name: "Test" }) });
    expect(screen.getByText(/Test/)).toBeInTheDocument();
  });

  it("should show customize button when user is an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: true }),
    });
    expect(screen.getByText(/Customize/)).toBeInTheDocument();
  });

  it("should not show customize button when user is not an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: false }),
    });
    expect(screen.queryByText(/Customize/)).not.toBeInTheDocument();
  });

  describe("EE with whitelabel", () => {
    it("should show a custom landing page illustration", () => {
      setup({ landingPageIllustration: "custom" });

      expect(screen.getByTestId("landing-page-illustration")).toHaveStyle({
        backgroundImage: `url("${ILLUSTRATION_URL}")`,
      });
    });

    it("should show the lighthouse illustration by default", () => {
      setup({ landingPageIllustration: "default" });

      expect(screen.getByTestId("lighthouse-illustration")).toBeInTheDocument();
    });

    it("should not show an illustration when it is turned off", () => {
      setup({ landingPageIllustration: "none" });

      expect(screen.getByTestId("home-page")).toBeInTheDocument();
      expect(
        screen.queryByTestId("landing-page-illustration"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("lighthouse-illustration"),
      ).not.toBeInTheDocument();
    });
  });

  describe("embedding homepage", () => {
    it("embedding checklist should show up on the embedding homepage", async () => {
      setup({
        currentUser: createMockUser({ is_superuser: true }),
        embeddingHomepage: "visible",
        hasSimpleEmbedding: true,
      });

      expect(
        await screen.findByText("Get started with modular embedding"),
      ).toBeVisible();
      expect(screen.queryByTestId("home-page")).not.toBeInTheDocument();

      expect(screen.getByText("Create a dashboard")).toBeVisible();
      expect(screen.getByText("Connect a database")).toBeVisible();
      await userEvent.click(screen.getByText("Connect a database"));

      // Sanity check: add data modal should open
      expect(
        await within(await screen.findByRole("dialog")).findByRole("heading", {
          name: "Add data",
        }),
      ).toBeVisible();
    });

    it.each([
      {
        case: "the setting is hidden",
        embeddingHomepage: "hidden",
        hasSimpleEmbedding: true,
        isAdmin: true,
      },
      {
        case: "simple embedding is not available",
        embeddingHomepage: "visible",
        hasSimpleEmbedding: false,
        isAdmin: true,
      },
      {
        case: "the user is not an admin",
        embeddingHomepage: "visible",
        hasSimpleEmbedding: true,
        isAdmin: false,
      },
    ] as const)(
      "should show the regular homepage when $case",
      ({ embeddingHomepage, hasSimpleEmbedding, isAdmin }) => {
        setup({
          currentUser: createMockUser({ is_superuser: isAdmin }),
          embeddingHomepage,
          hasSimpleEmbedding,
        });

        expect(screen.getByTestId("home-page")).toBeInTheDocument();
        expect(
          screen.queryByText("Get started with modular embedding"),
        ).not.toBeInTheDocument();
      },
    );
  });
});
