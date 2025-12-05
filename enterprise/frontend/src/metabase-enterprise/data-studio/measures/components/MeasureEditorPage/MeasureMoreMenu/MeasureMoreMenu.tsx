import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ActionIcon, Icon, Menu } from "metabase/ui";

type MeasureMoreMenuProps = {
  onRemove: () => void;
};

export function MeasureMoreMenu({ onRemove }: MeasureMoreMenuProps) {
  const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();

  const handleConfirm = () => {
    closeConfirm();
    onRemove();
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon aria-label={t`Measure actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            c="danger"
            leftSection={<Icon name="trash" />}
            onClick={openConfirm}
          >
            {t`Remove measure`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ConfirmModal
        title={t`Remove this measure?`}
        message={t`This measure will be permanently removed.`}
        opened={isConfirmOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        confirmButtonText={t`Remove`}
      />
    </>
  );
}
