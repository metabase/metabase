import { useCallback, useEffect } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { useLocation } from "react-use";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import { UpgradeModal } from "metabase/admin/upsells/components/UpgradeModal";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import Modal from "metabase/common/components/Modal";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import {
  LegacyStaticEmbeddingModal,
  type LegacyStaticEmbeddingModalProps,
} from "metabase/embedding/embedding-iframe-sdk-setup/components/LegacyStaticEmbeddingModal";
import { SdkIframeEmbedSetupModal } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeEmbedSetupModal";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PaletteShortcutsModal } from "metabase/palette/components/PaletteShortcutsModal/PaletteShortcutsModal";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { getCurrentOpenModalState } from "metabase/selectors/ui";
import type { WritebackAction } from "metabase-types/api";

export const NewModals = withRouter((props: WithRouterProps) => {
  const { pathname } = useLocation();
  const { id: currentNewModalId, props: currentNewModalProps } = useSelector(
    getCurrentOpenModalState,
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
      const props = currentNewModalProps as SdkIframeEmbedSetupModalProps;
      return (
        <SdkIframeEmbedSetupModal
          opened
          initialState={props?.initialState}
          onClose={handleModalClose}
        />
      );
    }
    case STATIC_LEGACY_EMBEDDING_TYPE: {
      const props = currentNewModalProps as LegacyStaticEmbeddingModalProps;

      return (
        <LegacyStaticEmbeddingModal
          experience={props?.experience}
          dashboardId={props?.dashboardId}
          questionId={props?.questionId}
          parentInitialState={props?.parentInitialState}
          onClose={handleModalClose}
        />
      );
    }
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
});
