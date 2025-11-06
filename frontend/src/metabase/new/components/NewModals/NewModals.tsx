import { useCallback } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import Modal from "metabase/common/components/Modal";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PaletteShortcutsModal } from "metabase/palette/components/PaletteShortcutsModal/PaletteShortcutsModal";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  type SdkIframeEmbedSetupModalProps,
} from "metabase/plugins";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { getCurrentOpenModalState } from "metabase/selectors/ui";
import type { WritebackAction } from "metabase-types/api";

export const NewModals = withRouter((props: WithRouterProps) => {
  const { id: currentNewModalId, props: currentNewModalProps } = useSelector(
    getCurrentOpenModalState<SdkIframeEmbedSetupModalProps>,
  );
  const dispatch = useDispatch();
  const collectionId = useSelector((state) =>
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
    case "embed": {
      return (
        <PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.SdkIframeEmbedSetupModal
          opened
          initialState={currentNewModalProps?.initialState}
          onClose={handleModalClose}
        />
      );
    }
    default:
      return (
        <PaletteShortcutsModal
          onClose={handleModalClose}
          open={currentNewModalId === "help"}
        />
      );
  }
});
