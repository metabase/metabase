import type React from "react";
import _ from "underscore";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SDKCollectionReference,
  getCollectionIdSlugFromReference,
} from "embedding-sdk/store/collections";
import { CreateDashboardModal as CreateDashboardModalCore } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { useSelector } from "metabase/lib/redux";
import type { Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

export interface CreateDashboardModalProps {
  initialCollectionId?: SDKCollectionReference;
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
  const { id, isLoading } = useValidatedEntityId<
    "collection",
    SDKCollectionReference
  >({
    type: "collection",
    id: initialCollectionId,
  });

  const initId = !isLoading && (id ?? initialCollectionId);

  const translatedCollectionId = useSelector((state: State) =>
    initId ? getCollectionIdSlugFromReference(state, initId) : undefined,
  );

  return (
    <CreateDashboardModalCoreWithLoading
      opened={!isLoading && isOpen}
      onCreate={onCreate}
      onClose={onClose}
      collectionId={translatedCollectionId}
    />
  );
};

const CreateDashboardModalCoreWithLoading = _.compose(
  Collections.load({
    id: (
      _state: State,
      props: React.ComponentProps<typeof CreateDashboardModalCore>,
    ) => props.collectionId,
    loadingAndErrorWrapper: false,
  }),
)(CreateDashboardModalCore);

export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
