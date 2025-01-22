/* istanbul ignore file */
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  Collection,
  DashboardQuestionCandidate,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CollectionMenu } from "../CollectionMenu";

export interface SetupOpts {
  collection?: Collection;
  tokenFeatures?: TokenFeatures;
  isAdmin?: boolean;
  isPersonalCollectionChild?: boolean;
  hasEnterprisePlugins?: boolean;
  dashboardQuestionCandidates?: DashboardQuestionCandidate[];
}

export const setup = ({
  collection = createMockCollection(),
  tokenFeatures = createMockTokenFeatures(),
  isAdmin = false,
  isPersonalCollectionChild = false,
  hasEnterprisePlugins = false,
  dashboardQuestionCandidates = [],
}: SetupOpts) => {
  fetchMock.get("express:/api/collection/:id/dashboard-question-candidates", {
    count: dashboardQuestionCandidates.length,
    data: dashboardQuestionCandidates,
  });

  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });

  const onUpdateCollection = jest.fn();

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <CollectionMenu
      collection={collection}
      isAdmin={isAdmin}
      isPersonalCollectionChild={isPersonalCollectionChild}
      onUpdateCollection={onUpdateCollection}
    />,
    { storeInitialState: state },
  );

  return { onUpdateCollection };
};
