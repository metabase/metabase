import { useCallback } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import Modal from "metabase/components/Modal";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { currentOpenModal } from "metabase/selectors/ui";
import type { WritebackAction } from "metabase-types/api";
import { PaletteShortcutsModal } from "metabase/palette/components/PaltteShortcutsModal";
import { useRegisterActions } from "kbar";

export const NewModals = withRouter((props: WithRouterProps) => {
  const currentNewModal = useSelector(currentOpenModal);
  const dispatch = useDispatch();
  const collectionId = useSelector(state =>
    Collections.selectors.getInitialCollectionId(state, props),
  );

  const handleActionCreated = useCallback(
    (action: WritebackAction) => {
      const nextLocation = Urls.modelDetail({ id: action.model_id }, "actions");
      dispatch(push(nextLocation));
    },
    [dispatch],
  );

  const handleModalClose = useCallback(() => {
    dispatch(closeModal());
  }, [dispatch]);

  useRegisterActions(
    [
      {
        name: "Toggle Shortcuts Modal",
        id: "shortcuts-modal",
        shortcut: ["?"],
        perform: () => {
          console.log("performing", currentNewModal);
          if (currentNewModal) {
            handleModalClose();
          } else {
            dispatch(setOpenModal("help"));
          }
        },
      },
    ],
    [currentNewModal],
  );

  console.log({
    currentNewModal,
  });

  switch (currentNewModal) {
    case "collection":
      return (
        <CreateCollectionModal
          onClose={handleModalClose}
          collectionId={collectionId}
        />
      );

    case "dashboard":
      return (
        <CreateDashboardModal
          opened
          onClose={handleModalClose}
          collectionId={collectionId}
        />
      );
    case "action":
      return (
        <Modal wide onClose={handleModalClose} enableTransition={false}>
          <ActionCreator
            onClose={handleModalClose}
            onSubmit={handleActionCreated}
          />
        </Modal>
      );
    case "help":
      return <PaletteShortcutsModal onClose={handleModalClose} />;
    default:
      return null;
  }
});
