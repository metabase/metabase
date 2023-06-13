import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { useShouldShowDatabasePromptBanner } from "./hooks";

interface setupOpts {
  isAdmin?: boolean;
  isPaidPlan?: boolean;
  onlyHaveSampleDatabase?: boolean;
  isOnAdminAddDatabasePage?: boolean;
  isWhiteLabeling?: boolean;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

async function setup({
  isAdmin = false,
  isPaidPlan = false,
  isWhiteLabeling = false,
  onlyHaveSampleDatabase = false,
}: setupOpts = {}) {
  if (onlyHaveSampleDatabase) {
    setupDatabasesEndpoints([TEST_DB]);
  } else {
    setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);
  }

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(
        isPaidPlan ? { sso: true } : {},
      ),
      "application-name": isWhiteLabeling ? "Acme Corp." : "Metabase",
    }),
  });

  function TestComponent() {
    const shouldShowDatabasePromptBanner = useShouldShowDatabasePromptBanner();
    return shouldShowDatabasePromptBanner ? (
      <>showing database prompt banner</>
    ) : (
      <>hiding database prompt banner</>
    );
  }

  renderWithProviders(<TestComponent />, {
    storeInitialState: state,
  });

  // 1. We will only call this endpoint when `isAdmin` and `isPaidPlan` are both true.
  // 2. This check ensures the conditions for database prompt banner are all available.
  // Then we could safely assert that the banner is not rendered.
  // If we don't wait for this API call to finish, the banner could have rendered,
  // and the test would still pass.
  if (isAdmin && isPaidPlan && !isWhiteLabeling) {
    await waitFor(() => {
      expect(fetchMock.called("path:/api/database")).toBe(true);
    });
  }
}

describe("useShouldShowDatabasePromptBanner", () => {
  beforeEach(() => {
    setupEnterpriseTest();
  });

  it("should render for admin user with paid plan and has only sample database, but not white-labeled", async () => {
    await setup({
      isAdmin: true,
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: false,
    });

    expect(screen.getByText("showing database prompt banner")).toBeVisible();
  });

  it.each([
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: false,
    },
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: false,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: false,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: false,
    },
  ] as const)(
    "should not render for non-admin users when isPaidPlan: $isPaidPlan, onlyHaveSampleDatabase: $onlyHaveSampleDatabase, isWhiteLabeling: $isWhiteLabeling",
    async ({ isPaidPlan, onlyHaveSampleDatabase, isWhiteLabeling }) => {
      await setup({
        isAdmin: false,
        isPaidPlan,
        onlyHaveSampleDatabase,
        isWhiteLabeling,
      });

      expect(screen.getByText("hiding database prompt banner")).toBeVisible();
    },
  );

  it.each([
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: true,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: false,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: false,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: true,
    },
    {
      isPaidPlan: false,
      onlyHaveSampleDatabase: false,
      isWhiteLabeling: false,
    },
  ] as const)(
    "should not render for admin users when isPaidPlan: $isPaidPlan, onlyHaveSampleDatabase: $onlyHaveSampleDatabase, isWhiteLabeling: $isWhiteLabeling",
    async ({ isPaidPlan, onlyHaveSampleDatabase, isWhiteLabeling }) => {
      await setup({
        isAdmin: true,
        isPaidPlan,
        onlyHaveSampleDatabase,
        isWhiteLabeling,
      });

      expect(screen.getByText("hiding database prompt banner")).toBeVisible();
    },
  );
});
