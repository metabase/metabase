import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupGetUserKeyValueEndpoint } from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { QuestionAlertListModal } from "metabase/notifications/modals";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  ModerationReview,
  Notification,
  User,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionMoreActionsMenu } from "../QuestionMoreActionsMenu";

type SetupOpts = {
  alerts?: Notification[];
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isEmailSetup: boolean;
  isEnterprise: boolean;
  moderationReviews?: ModerationReview[];
  result?: Dataset;
};

export function setup({
  alerts = [],
  canManageSubscriptions = false,
  isAdmin = false,
  isEmailSetup = false,
  isEnterprise = false,
  moderationReviews,
  result = createMockDataset(),
}: SetupOpts) {
  const card = createMockCard(
    isEnterprise ? { moderation_reviews: moderationReviews ?? [] } : {},
  );

  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
    content_verification: isEnterprise,
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
    qb: {
      queryResults: [result],
    },
  });

  fetchMock.get("path:/api/user/recipients", { data: [] });
  setupWebhookChannelsEndpoint();
  setupListNotificationEndpoints({ card_id: card.id }, alerts);
  setupGetUserKeyValueEndpoint({
    namespace: "user_acknowledgement",
    key: "turn_into_model_modal",
    value: false,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<TestComponent card={card} />, {
    storeInitialState: state,
  });
}

interface Props {
  card: Card;
}

const TestComponent = ({ card }: Props) => {
  const question = new Question(card);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <QuestionMoreActionsMenu
        question={question}
        onOpenModal={() => setIsModalOpen(true)}
        onSetQueryBuilderMode={jest.fn()}
      />

      {isModalOpen && (
        <QuestionAlertListModal
          question={question}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
};

export function openMenu() {
  return userEvent.click(
    screen.getByRole("button", { name: /Move, trash, and more/ }),
  );
}
