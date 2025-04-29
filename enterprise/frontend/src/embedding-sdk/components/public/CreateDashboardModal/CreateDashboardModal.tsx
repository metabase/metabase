import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import type { MetabaseDashboard } from "embedding-sdk/types/dashboard";
import { useCollectionQuery } from "metabase/common/hooks";
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
  const { id, isLoading: isTranslateCollectionLoading } =
    useTranslatedCollectionId({
      id: initialCollectionId,
    });

  const { isLoading: isCollectionQueryLoading } = useCollectionQuery({
    id,
  });

  const isLoading = isTranslateCollectionLoading && isCollectionQueryLoading;

  if (isLoading) {
    return null;
  }

  return (
    <CreateDashboardModalCore
      opened={!isLoading && isOpen}
      onCreate={onCreate}
      onClose={() => onClose?.()}
      collectionId={id}
    />
  );
};

/**
 * Creates a dashboard
 *
 * @function
 * @category CreateDashboardModal
 */
export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
