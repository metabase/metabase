import { t } from "ttag";

import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { useConfirmation, useMetadataToasts } from "metabase/common/hooks";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useRemoveDataAppGroupMutation } from "metabase-enterprise/api";
import type { DataApp, DataAppGroup } from "metabase-types/api";

import { trackDataAppGroupRemoved } from "../../../../analytics";

type DataAppGroupMenuProps = {
  app: DataApp;
  group: DataAppGroup;
};

export function DataAppGroupMenu({ app, group }: DataAppGroupMenuProps) {
  const [removeGroup] = useRemoveDataAppGroupMutation();
  const { sendErrorToast } = useMetadataToasts();
  const { show: showConfirmation, modalContent } = useConfirmation();
  const groupName = getGroupNameLocalized(group);

  const handleRemove = () => {
    showConfirmation({
      title: t`Remove ${groupName} from ${app.display_name}?`,
      message: t`People in this group will no longer be able to open the app, unless another of their groups has access.`,
      confirmButtonText: t`Remove access`,
      onConfirm: async () => {
        const { error } = await removeGroup({
          name: app.name,
          group_id: group.id,
        });
        if (error) {
          sendErrorToast(t`Failed to remove ${groupName}`);
        } else {
          trackDataAppGroupRemoved(app.id);
        }
      },
    });
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <MoreMenuButton
            aria-label={t`${groupName} options`}
            onClick={(event) => event.stopPropagation()}
          />
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          <Menu.Item
            component="a"
            href={Urls.getSubpathSafeUrl(Urls.adminGroup(group.id))}
            target="_blank"
            rel="noreferrer"
            leftSection={<Icon name="external" />}
          >
            {t`View group`}
          </Menu.Item>
          <Menu.Item leftSection={<Icon name="trash" />} onClick={handleRemove}>
            {t`Remove access`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
