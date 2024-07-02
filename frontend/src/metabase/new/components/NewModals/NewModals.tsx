import { useCallback } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeModal } from "metabase/redux/ui";
import { currentOpenModal } from "metabase/selectors/ui";
import type { WritebackAction } from "metabase-types/api";

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
        <Modal onClose={handleModalClose}>
          <CreateDashboardModalConnected
            onClose={handleModalClose}
            collectionId={collectionId}
          />
        </Modal>
      );
    case "action":
      return (
        <Modal
          wide
          closeOnClickOutside
          onClose={handleModalClose}
          enableTransition={false}
        >
          <ActionCreator
            onClose={handleModalClose}
            onSubmit={handleActionCreated}
          />
        </Modal>
      );
    default:
      return null;
  }
});
