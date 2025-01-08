import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { Card, User } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionMoreActionsMenu } from "../QuestionMoreActionsMenu";

type SettingsProps = {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isAdmin?: boolean;
  isEnterprise?: boolean;
  card?: Card;
};

const setupState = ({
  isEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
  isAdmin = false,
  isEnterprise = false,
  card,
}: SettingsProps) => {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: isEnterprise,
    dashboard_subscription_filters: isEnterprise,
    audit_app: isEnterprise,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-public-sharing": isPublicSharingEnabled,
    "enable-embedding-static": isEmbeddingEnabled,
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: {
      ...user,
      qb: {
        card,
      },
    } as User,
  });

  return state;
};

export function setup({
  isEmbeddingEnabled,
  isPublicSharingEnabled,
  isAdmin = false,
  isEnterprise = false,
  hasPublicLink = false,
  question: questionOverrides = {},
}: {
  isEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
  isAdmin?: boolean;
  isEnterprise?: boolean;
  hasPublicLink?: boolean;
  question?: Partial<Card>;
}) {
  const card = createMockCard({
    name: "My Cool Question",
    public_uuid: hasPublicLink && isPublicSharingEnabled ? "1337bad801" : null,
    ...questionOverrides,
  });

  const state = setupState({
    isPublicSharingEnabled,
    isEmbeddingEnabled,
    isAdmin,
    isEnterprise,
  });

  if (isEnterprise) {
    setupEnterprisePlugins();
  }

  const onOpenModal = jest.fn();

  renderWithProviders(
    <QuestionMoreActionsMenu
      question={new Question(card)}
      onOpenModal={onOpenModal}
      onSetQueryBuilderMode={jest.fn()}
    />,
    {
      storeInitialState: state,
    },
  );

  return {
    onOpenModal,
  };
}

export const openMenu = async () => {
  await userEvent.click(getIcon("ellipsis"));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
};
