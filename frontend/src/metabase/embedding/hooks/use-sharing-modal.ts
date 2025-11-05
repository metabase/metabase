import { useCallback, useEffect, useState } from "react";

import type {
  DashboardSharingModalType,
  QuestionSharingModalType,
} from "metabase/embedding/components/SharingMenu/types";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import { getCurrentOpenModal } from "metabase/selectors/ui";
import type { ModalName } from "metabase-types/store/modal";

export const useSharingModal = <
  TModalType extends DashboardSharingModalType | QuestionSharingModalType,
>() => {
  const dispatch = useDispatch();
  const currentOpenModal = useSelector(getCurrentOpenModal);

  const [modalType, setModalType] = useState<TModalType | null>(null);

  useEffect(() => {
    const allowedModalTypes: ModalName[] = [STATIC_LEGACY_EMBEDDING_TYPE];

    const isValidModalType =
      currentOpenModal && allowedModalTypes.includes(currentOpenModal);

    if (isValidModalType) {
      setModalType(currentOpenModal as TModalType);
    }
  }, [dispatch, currentOpenModal]);

  const handleSetModalType = useCallback(
    (modalType: TModalType | null) => {
      if (!modalType) {
        dispatch(setOpenModal(null));
      }

      setModalType(modalType);
    },
    [dispatch],
  );

  return { modalType, setModalType: handleSetModalType };
};
