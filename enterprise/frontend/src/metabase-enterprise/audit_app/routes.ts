import {
  type ModalComponentProps,
  modalRoute,
} from "metabase/common/components/ModalRoute";
import { lazyPluginSlot } from "metabase/plugins";

const UnsubscribeUserModal = lazyPluginSlot<ModalComponentProps>(() =>
  import("./containers/UnsubscribeUserModal/UnsubscribeUserModal").then(
    ({ UnsubscribeUserModal }) => UnsubscribeUserModal,
  ),
);

export const getUserMenuRoutes = (): React.ReactNode =>
  modalRoute("unsubscribe", UnsubscribeUserModal, { noWrap: true });
