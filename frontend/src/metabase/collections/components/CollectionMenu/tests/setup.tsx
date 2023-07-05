import { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { renderWithProviders } from "__support__/ui";
import { CollectionMenu } from "../CollectionMenu";

export interface SetupOpts {
  collection?: Collection;
  isAdmin?: boolean;
  isPersonalCollectionChild?: boolean;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  collection = createMockCollection(),
  isAdmin = false,
  isPersonalCollectionChild = false,
  hasEnterprisePlugins = false,
}: SetupOpts) => {
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
  );

  return { onUpdateCollection };
};
