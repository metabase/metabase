import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import type { MetabaseDashboard, SdkCollectionId } from "embedding-sdk-package";
import { useCollectionQuery, useLocale } from "metabase/common/hooks";
import { CreateDashboardModal as CreateDashboardModalCore } from "metabase/dashboard/containers/CreateDashboardModal";

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

  const { isLoading: isCollectionQueryLoading } = useCollectionQuery({
    id: initialCollectionId,
  });

  if (isLocaleLoading || isCollectionQueryLoading) {
    return null;
  }

  return (
    <CreateDashboardModalCore
      opened={!isCollectionQueryLoading && isOpen}
      onCreate={onCreate}
      onClose={() => onClose?.()}
      collectionId={initialCollectionId}
    />
  );
};

export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
