import { useCallback, useEffect } from "react";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import CreateCollectionModal, {
  type CreateCollectionModalOwnProps,
} from "metabase/common/collections/containers/CreateCollectionModal";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import { UpgradeModal } from "metabase/common/components/upsells/components/UpgradeModal";
import { PaletteShortcutsModal } from "metabase/palette/components/PaletteShortcutsModal/PaletteShortcutsModal";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { ModalState } from "metabase/redux/store/modal";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { useLocation, useParams } from "metabase/router";

const getCurrentOpenModalState = <TProps,>(state: State) =>
  // Unjustified type cast. FIXME
  state.modal as ModalState<TProps>;

export const NewModals = () => {
  const location = useLocation();
  const params = useParams();
  const { pathname } = location;
  const { id: currentNewModalId, props: currentNewModalProps } = useSelector(
    getCurrentOpenModalState<CreateCollectionModalOwnProps>,
  );
  const dispatch = useDispatch();
  const collectionId =
    useInitialCollectionId({ location, params }) ?? undefined;

  const handleModalClose = useCallback(() => {
    dispatch(closeModal());
  }, [dispatch]);

  useEffect(() => {
    // Hide the modals on location change
    handleModalClose();
  }, [handleModalClose, pathname]);

  useRegisterShortcut(
    [
      {
        id: "shortcuts-modal",
        perform: () => {
          if (currentNewModalId) {
            handleModalClose();
          } else {
            dispatch(setOpenModal("help"));
          }
        },
      },
    ],
    [currentNewModalId],
  );

  switch (currentNewModalId) {
    case "collection": {
      const collectionProps = currentNewModalProps || null;

      return (
        <CreateCollectionModal
          onClose={handleModalClose}
          {...collectionProps}
          collectionId={collectionProps?.collectionId ?? collectionId}
        />
      );
    }

    case "dashboard":
      return (
        <CreateDashboardModal
          opened
          onClose={handleModalClose}
          collectionId={collectionId}
        />
      );
    case "upgrade":
      return <UpgradeModal opened onClose={handleModalClose} />;
    default:
      return (
        <PaletteShortcutsModal
          onClose={handleModalClose}
          open={currentNewModalId === "help"}
        />
      );
  }
};
