import { t } from "ttag";

import {
  useDiscardFieldValuesMutation,
  useRescanFieldValuesMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface FieldActionsMenuProps {
  fieldId: FieldId;
  onPreviewClick: () => void;
}

/** Overflow menu holding the actions for a single field in the drawer header. */
export function FieldActionsMenu({
  fieldId,
  onPreviewClick,
}: FieldActionsMenuProps) {
  const [rescanFieldValues] = useRescanFieldValuesMutation();
  const [discardFieldValues] = useDiscardFieldValuesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleRescan = async () => {
    const { error } = await rescanFieldValues(fieldId);
    if (error) {
      sendErrorToast(t`Failed to start scan`);
    } else {
      sendSuccessToast(t`Scan triggered`);
    }
  };

  const handleDiscard = async () => {
    const { error } = await discardFieldValues(fieldId);
    if (error) {
      sendErrorToast(t`Failed to discard values`);
    } else {
      sendSuccessToast(t`Discard triggered`);
    }
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="eye" />} onClick={onPreviewClick}>
          {t`Preview`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<Icon name="list" />} onClick={handleRescan}>
          {t`Re-scan field values`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={handleDiscard}>
          {t`Discard cached field values`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
