import { DashboardActionPickerContent } from "metabase/actions/components/ActionViz/DashboardActionPickerContent";
import { Modal } from "metabase/ui";
import type { ActionDashboardCard, Dashboard } from "metabase-types/api";

interface ActionPickerModalProps {
  isOpen: boolean;
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onClose: () => void;
}

export const DashboardActionPickerModal = ({
  isOpen,
  dashboard,
  dashcard,
  onClose,
}: ActionPickerModalProps) => {
  return (
    <Modal.Root opened={isOpen} onClose={onClose}>
      <Modal.Overlay />
      <DashboardActionPickerContent
        dashboard={dashboard}
        dashcard={dashcard as ActionDashboardCard}
        onClose={onClose}
      />
    </Modal.Root>
  );
};
