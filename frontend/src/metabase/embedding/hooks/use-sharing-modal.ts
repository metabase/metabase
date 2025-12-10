import { useCallback, useState } from "react";

import type {
  DashboardSharingModalType,
  QuestionSharingModalType,
} from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useOpenEmbedJsWizard } from "metabase/embedding/hooks/use-open-embed-js-wizard";
import { useDispatch } from "metabase/lib/redux";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { setOpenModal } from "metabase/redux/ui";

export const useSharingModal = <
  TModalType extends DashboardSharingModalType | QuestionSharingModalType,
>({
  resource,
  resourceType,
}: {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
}) => {
  const dispatch = useDispatch();

  const [modalType, setModalType] = useState<TModalType | null>(null);

  const openEmbedJsWizard = useOpenEmbedJsWizard({
    initialState: {
      resourceId: resource.id,
      resourceType,
      isGuest: true,
      useExistingUserSession: true,
    },
  });

  const handleSetModalType = useCallback(
    (modalType: TModalType | null) => {
      if (!modalType) {
        dispatch(setOpenModal(null));
      }

      switch (modalType) {
        case GUEST_EMBED_EMBEDDING_TYPE:
          openEmbedJsWizard({ onBeforeOpen: () => setModalType(null) });
          break;

        default:
          setModalType(modalType);
      }
    },
    [dispatch, openEmbedJsWizard],
  );

  return { modalType, setModalType: handleSetModalType };
};
