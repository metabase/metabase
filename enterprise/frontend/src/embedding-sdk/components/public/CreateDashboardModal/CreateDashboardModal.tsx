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

/**
 * @category CreateDashboardModal
 */
export interface CreateDashboardModalProps {
  /**
   * Initial collection in which to create a dashboard. You can use predefined system values like `root` or `personal`.
   */
  initialCollectionId?: SdkCollectionId;

  /**
   * Whether the modal is open or not.
   */
  isOpen?: boolean;

  /**
   * Handler to react on dashboard creation.
   */
  onCreate: (dashboard: Dashboard) => void;

  /**
   * Handler to close modal component
   */
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

/**
 * Creates a dashboard
 *
 * @function
 * @category CreateDashboardModal
 */
export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
