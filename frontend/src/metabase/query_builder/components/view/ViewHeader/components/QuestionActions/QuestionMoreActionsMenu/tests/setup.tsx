import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupGetUserKeyValueEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { QueryModalType } from "metabase/redux/store";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardType,
  DashboardId,
  ModerationReview,
  Notification,
  User,
} from "metabase-types/api";
import {
  createMockCard,
  createMockNotification,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import { QueryModals } from "../../../../../../QueryModals";
import { QuestionMoreActionsMenu } from "../QuestionMoreActionsMenu";

type SetupOpts = {
  alerts?: Notification[];
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isEmailSetup: boolean;
  isEnterprise: boolean;
  moderationReviews?: ModerationReview[];
  cardType?: CardType;
  dashboardId?: DashboardId;
  /** Stores alerts created through `POST /api/notification` and lists them back */
  withCreateAlertEndpoint?: boolean;
};

export function setup({
  alerts = [],
  canManageSubscriptions = false,
  isAdmin = false,
  isEmailSetup = false,
  isEnterprise = false,
  moderationReviews,
  cardType = "question",
  dashboardId,
  withCreateAlertEndpoint = false,
}: SetupOpts) {
  const card = createMockCard({
    id: 12,
    type: cardType,
    dashboard_id: dashboardId ?? null,
    ...(isEnterprise ? { moderation_reviews: moderationReviews ?? [] } : {}),
  });

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
    // Unjustified type cast. FIXME
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

  fetchMock.get("path:/api/user/recipients", { data: [] });
  setupWebhookChannelsEndpoint();
  setupCollectionsEndpoints({ collections: [] });
  setupNotificationChannelsEndpoints({
    email: { configured: isEmailSetup },
    slack: { configured: false },
    http: { configured: false },
  });
  const storedAlerts = [...alerts];
  setupListNotificationEndpoints({ card_id: card.id }, () => storedAlerts);
  if (withCreateAlertEndpoint) {
    fetchMock.post("path:/api/notification", ({ options }) => {
      const body: unknown = JSON.parse(String(options.body));
      const requestedCardId =
        isObject(body) && isObject(body.payload) ? body.payload.card_id : null;
      if (requestedCardId !== card.id) {
        return { status: 400 };
      }
      const defaultAlert = createMockNotification();
      const created = createMockNotification({
        id: 99,
        payload: defaultAlert.payload && {
          ...defaultAlert.payload,
          card_id: card.id,
        },
      });
      storedAlerts.push(created);
      return created;
    });
  }
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

  return { card };
}

interface Props {
  card: Card;
}

const TestComponent = ({ card }: Props) => {
  const question = new Question(card, createMockMetadata());
  const [modal, setModal] = useState<QueryModalType | null>(null);

  return (
    <>
      <QuestionMoreActionsMenu
        question={question}
        onOpenModal={setModal}
        onSetQueryBuilderMode={jest.fn()}
      />
      <QueryModals
        modal={modal}
        question={question}
        originalQuestion={question}
        card={card}
        onCreate={jest.fn()}
        onSave={jest.fn()}
        onCloseModal={() => setModal(null)}
        onOpenModal={setModal}
        onChangeLocation={jest.fn()}
        setQueryBuilderMode={jest.fn()}
      />
    </>
  );
};

export function openMenu(name: RegExp = /Move, trash, and more/) {
  return userEvent.click(screen.getByRole("button", { name }));
}
