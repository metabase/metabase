import { Suspense, lazy, useCallback, useEffect } from "react";

import {
  closeEmbedSetupModal,
  getEmbedSetupModal,
} from "metabase/embedding/embed-setup-modal.slice";
import { useDispatch, useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";

// These reach the dashboard actions and selectors, so they load when a modal opens rather than with the app.
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
