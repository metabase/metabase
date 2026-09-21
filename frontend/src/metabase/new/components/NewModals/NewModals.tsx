import { Suspense, lazy, useCallback, useEffect } from "react";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import CreateCollectionModal, {
  type CreateCollectionModalOwnProps,
} from "metabase/common/collections/containers/CreateCollectionModal";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import { UpgradeModal } from "metabase/common/components/upsells/components/UpgradeModal";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { PaletteShortcutsModal } from "metabase/palette/components/PaletteShortcutsModal/PaletteShortcutsModal";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type {
  LegacyStaticEmbeddingModalProps,
  SdkIframeEmbedSetupModalProps,
} from "metabase/plugins";
import { ActionCreator } from "metabase/querying/action-creator";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { ModalState } from "metabase/redux/store/modal";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { Modal, PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

/**
 * The embed setup modals, fetched when one is opened.
 *
 * `NewModals` is mounted for the whole session, so importing these directly put
 * them in the initial bundle. They reach the dashboard actions and selectors,
 * which is most of the dashboard feature. Nothing renders while they load: a
 * modal that has just been asked for has no earlier state to preserve.
 */
const LegacyStaticEmbeddingModal = lazy(() =>
  import("metabase/embedding/embedding-iframe-sdk-setup/components/LegacyStaticEmbeddingModal").then(
    ({ LegacyStaticEmbeddingModal }) => ({
      default: LegacyStaticEmbeddingModal,
    }),
  ),
);

const SdkIframeEmbedSetupModal = lazy(() =>
  import("metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeEmbedSetupModal").then(
    ({ SdkIframeEmbedSetupModal }) => ({
      default: SdkIframeEmbedSetupModal,
    }),
  ),
);

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
  const navigate = useNavigate();
  const collectionId =
    useInitialCollectionId({ location, params }) ?? undefined;

  const handleActionCreated = useCallback(
    (action: WritebackAction) => {
      const nextLocation = Urls.modelDetail({ id: action.model_id }, "actions");
      navigate(nextLocation);
    },
    [navigate],
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
    case "action":
      return (
        <Modal
          {...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS}
          opened
          onClose={handleModalClose}
          size="95%"
          withCloseButton={false}
          padding={0}
        >
          <ActionCreator
            onClose={handleModalClose}
            onSubmit={handleActionCreated}
          />
        </Modal>
      );
    case "embed": {
      // Unjustified type cast. FIXME
      const props = currentNewModalProps as SdkIframeEmbedSetupModalProps;
      return (
        <Suspense fallback={null}>
          <SdkIframeEmbedSetupModal
            opened
            initialState={props?.initialState}
            onClose={handleModalClose}
          />
        </Suspense>
      );
    }
    case STATIC_LEGACY_EMBEDDING_TYPE: {
      // Unjustified type cast. FIXME
      const props = currentNewModalProps as LegacyStaticEmbeddingModalProps;

      return (
        <Suspense fallback={null}>
          <LegacyStaticEmbeddingModal
            experience={props?.experience}
            dashboardId={props?.dashboardId}
            questionId={props?.questionId}
            parentInitialState={props?.parentInitialState}
            onClose={handleModalClose}
          />
        </Suspense>
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
};
