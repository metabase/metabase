import { useDispatch, useSelector } from "metabase/lib/redux";
import { currentOpenModal } from "metabase/selectors/ui";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import Modal from "metabase/components/Modal";
import { CreateDashboardModalConnected } from "metabase/dashboard/containers/CreateDashboardModal";
import { closeModal } from "metabase/redux/ui";

export const NewModals = () => {
  const currentNewModal = useSelector(currentOpenModal);
  const dispatch = useDispatch();

  switch (currentNewModal) {
    case "collection":
      return (
        <Modal>
          <CreateCollectionModal onClose={() => dispatch(closeModal())} />
        </Modal>
      );

    case "dashboard":
      return (
        <Modal>
          <CreateDashboardModalConnected
            onClose={() => dispatch(closeModal())}
          />
        </Modal>
      );
    case "action":
      return (
        <Modal
          wide
          closeOnClickOutside
          onClose={() => dispatch(closeModal())}
          enableTransition={false}
        >
          <ActionCreator onClose={() => dispatch(closeModal())} />
        </Modal>
      );
    default:
      return null;
  }
};
