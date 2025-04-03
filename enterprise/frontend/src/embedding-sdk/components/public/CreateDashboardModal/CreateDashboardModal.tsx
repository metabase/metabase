import _ from "underscore";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import {
  CreateDashboardModal as CreateDashboardModalCore,
  type CreateDashboardModalProps as CreateDashboardModalCoreProps,
} from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections";
import type { Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface CreateDashboardModalProps {
  initialCollectionId?: SdkCollectionId;
  isOpen?: boolean;
  onCreate: (dashboard: Dashboard) => void;
  onClose?: () => void;
}

const CreateDashboardModalInner = ({
  initialCollectionId = "personal",
  isOpen = true,
  onCreate,
  onClose,
}: CreateDashboardModalProps) => {
  const { id, isLoading } = useTranslatedCollectionId({
    id: initialCollectionId,
  });

  if (isLoading) {
    return null;
  }

  return (
    <CreateDashboardModalCoreWithLoading
      opened={!isLoading && isOpen}
      onCreate={onCreate}
      onClose={onClose}
      collectionId={id}
    />
  );
};

const CreateDashboardModalCoreWithLoading = _.compose(
  Collections.load({
    id: (_state: State, props: CreateDashboardModalCoreProps) =>
      props.collectionId,
    loadingAndErrorWrapper: false,
  }),
)(CreateDashboardModalCore);

export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
