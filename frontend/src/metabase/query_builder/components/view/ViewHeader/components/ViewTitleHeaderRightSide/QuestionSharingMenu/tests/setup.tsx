import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { Card, Notification, User } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { QuestionSharingMenu } from "../QuestionSharingMenu";

type SettingsProps = {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isAdmin?: boolean;
  canManageSubscriptions?: boolean;
  isEnterprise?: boolean;
  card?: Card;
};

const setupState = ({
  isEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  card,
}: SettingsProps) => {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  setupNotificationChannelsEndpoints({
    slack: { configured: isSlackSetup },
    email: { configured: isEmailSetup },
  } as any);

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-public-sharing": isPublicSharingEnabled,
    "enable-embedding-static": isEmbeddingEnabled,
    "email-configured?": isEmailSetup,
    "slack-token-valid?": isSlackSetup,
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  return createMockState({
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
};

export function setupQuestionSharingMenu({
  isPublicSharingEnabled = false,
  isEmbeddingEnabled = false,
  isEmailSetup = false,
  isSlackSetup = false,
  isAdmin = false,
  canManageSubscriptions = false,
  isEnterprise = false,
  hasPublicLink = false,
  question: questionOverrides = {},
  alerts = [],
}: {
  question?: Partial<Card>;
  hasPublicLink?: boolean;
  alerts?: Notification[];
} & SettingsProps) {
  const card = createMockCard({
    name: "My Cool Question",
    public_uuid: hasPublicLink && isPublicSharingEnabled ? "1337bad801" : null,
    ...questionOverrides,
  });

  const state = setupState({
    isPublicSharingEnabled,
    isEmbeddingEnabled,
    isEmailSetup,
    isSlackSetup,
    isAdmin,
    canManageSubscriptions,
    isEnterprise,
    card,
  });

  const user = checkNotNull(state.currentUser);

  setupListNotificationEndpoints({ card_id: card.id }, alerts);
  setupUsersEndpoints([user]);
  setupUserRecipientsEndpoint({
    users: [user],
  });
  setupWebhookChannelsEndpoint();

  if (isEnterprise) {
    setupEnterpriseOnlyPlugin("audit_app");
    setupEnterpriseOnlyPlugin("application_permissions");
    setupEnterpriseOnlyPlugin("collections");
  }

  renderWithProviders(<QuestionSharingMenu question={new Question(card)} />, {
    storeInitialState: state,
  });
}

export const openMenu = () => {
  return userEvent.click(screen.getByTestId("sharing-menu-button"));
};
