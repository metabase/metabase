import { Suspense, lazy, useCallback, useEffect } from "react";

import {
  closeEmbedSetupModal,
  getEmbedSetupModal,
} from "metabase/embedding/embed-setup-modal.slice";
import { useDispatch, useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";

/**
 * The embed setup modals, fetched when one is opened.
 *
 * `EmbedSetupModals` is mounted for the whole session, so importing these directly
 * would put them in the initial bundle. They reach the dashboard actions and
 * selectors, which is most of the dashboard feature. Nothing renders while they
 * load: a modal that has just been asked for has no earlier state to preserve.
 */
const SdkIframeEmbedSetupModal = lazy(() =>
  import("./SdkIframeEmbedSetupModal").then(({ SdkIframeEmbedSetupModal }) => ({
    default: SdkIframeEmbedSetupModal,
  })),
);

const LegacyStaticEmbeddingModal = lazy(() =>
  import("./LegacyStaticEmbeddingModal").then(
    ({ LegacyStaticEmbeddingModal }) => ({
      default: LegacyStaticEmbeddingModal,
    }),
  ),
);

export const EmbedSetupModals = () => {
  const modalState = useSelector(getEmbedSetupModal);
  const dispatch = useDispatch();
  const { pathname } = useLocation();

  const handleClose = useCallback(() => {
    dispatch(closeEmbedSetupModal());
  }, [dispatch]);

  // Hide the modals on location change
  useEffect(() => {
    handleClose();
  }, [handleClose, pathname]);

  switch (modalState.modal) {
    case "embed-js-wizard":
      return (
        <Suspense fallback={null}>
          <SdkIframeEmbedSetupModal
            opened
            initialState={modalState.initialState}
            onClose={handleClose}
          />
        </Suspense>
      );
    case "legacy-static-embedding":
      return (
        <Suspense fallback={null}>
          <LegacyStaticEmbeddingModal
            {...modalState.props}
            onClose={handleClose}
          />
        </Suspense>
      );
    default:
      return null;
  }
};
