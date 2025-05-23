import { Modal } from "metabase/ui";

export const AddDataModal = ({
  onClose,
  opened,
}: {
  onClose: () => void;
  opened: boolean;
}) => {
  return <Modal opened={opened} onClose={onClose} title="Add data" />;
};
