import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { useTranslatedCollectionId } from "embedding-sdk/hooks/private/use-translated-collection-id";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import { useCollectionQuery } from "metabase/common/hooks";
import { CreateDashboardModal as CreateDashboardModalCore } from "metabase/dashboard/containers/CreateDashboardModal";
import type { Dashboard } from "metabase-types/api";

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

export const CreateDashboardModal = withPublicComponentWrapper(
  CreateDashboardModalInner,
);
