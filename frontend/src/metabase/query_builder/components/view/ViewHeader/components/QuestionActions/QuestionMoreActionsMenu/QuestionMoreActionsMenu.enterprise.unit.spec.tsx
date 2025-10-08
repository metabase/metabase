import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupGetUserKeyValueEndpoint } from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { User } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionMoreActionsMenu } from "../QuestionMoreActionsMenu";

type SetupOpts = {
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isEmailSetup: boolean;
  isEnterprise: boolean;
};

function setup({
  isEmailSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
}: SetupOpts) {
  const card = createMockCard();

  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "email-configured?": isEmailSetup,
  });

  const user = createMockUser({ is_superuser: isAdmin });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: {
      ...user,
      permissions: {
        can_access_subscription: canManageSubscriptions,
      },
      qb: {
        card,
      },
    } as User,
  });

  setupListNotificationEndpoints({ card_id: card.id }, []);

  setupGetUserKeyValueEndpoint({
    namespace: "user_acknowledgement",
    key: "turn_into_model_modal",
    value: false,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <QuestionMoreActionsMenu
      question={new Question(card)}
      onOpenModal={jest.fn()}
      onSetQueryBuilderMode={jest.fn()}
    />,
    { storeInitialState: state },
  );
}

const openMenu = () => {
  return userEvent.click(
    screen.getByRole("button", { name: /Move, trash, and more/ }),
  );
};

describe("QuestionMoreActionsMenu > Enterprise", () => {
  it('Should show the "Create an alert" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    setup({
      canManageSubscriptions: true,
      isAdmin: false,
      isEmailSetup: true,
      isEnterprise: true,
    });
    await openMenu();
    expect(screen.getByText("Create an alert")).toBeInTheDocument();
  });

  describe("alerts permission disabled", () => {
    it('Should not show the "Create an alert" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
      setup({
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: true,
      });
      await openMenu();
      expect(screen.queryByText("Create an alert")).not.toBeInTheDocument();
    });
  });
});
