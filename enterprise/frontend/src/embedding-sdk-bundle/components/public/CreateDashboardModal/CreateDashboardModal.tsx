import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import {
  getCollectionIdSlugFromReference,
  getCollectionIdValueFromReference,
} from "embedding-sdk-bundle/store/collections";
import type { MetabaseDashboard, SdkCollectionId } from "embedding-sdk-package";
import { useCollectionQuery, useLocale } from "metabase/common/hooks";
import { CreateDashboardModal as CreateDashboardModalCore } from "metabase/dashboard/containers/CreateDashboardModal";
import { useSelector } from "metabase/lib/redux";

import { createDashboardModalSchema } from "./CreateDashboardModal.schema";

/**
 * @expand
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
  onCreate: (dashboard: MetabaseDashboard) => void;

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
  const { isLocaleLoading } = useLocale();

  const collectionId = useSelector((state) =>
    getCollectionIdValueFromReference(state, initialCollectionId),
  );

  const collectionIdSlug = useSelector((state) =>
    getCollectionIdSlugFromReference(state, initialCollectionId),
  );

  const { isLoading: isCollectionQueryLoading } = useCollectionQuery({
    id: collectionIdSlug,
  });

  if (isLocaleLoading || isCollectionQueryLoading) {
    return null;
  }

  return (
    <CreateDashboardModalCore
      opened={!isCollectionQueryLoading && isOpen}
      onCreate={onCreate}
      onClose={() => onClose?.()}
      collectionId={collectionId}
    />
  );
};

export const CreateDashboardModal = Object.assign(
  withPublicComponentWrapper(CreateDashboardModalInner),
  { schema: createDashboardModalSchema },
);
