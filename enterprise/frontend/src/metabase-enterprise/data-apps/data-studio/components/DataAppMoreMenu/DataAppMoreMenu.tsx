import type { MouseEvent } from "react";
import { t } from "ttag";

import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { useConfirmation, useMetadataToasts } from "metabase/common/hooks";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useSetDataAppEnabledMutation } from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { isDataAppOpenable } from "../../utils";

type DataAppMoreMenuProps = {
  app: DataApp;
};

export function DataAppMoreMenu({ app }: DataAppMoreMenuProps) {
  const [setDataAppEnabled] = useSetDataAppEnabledMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { show: showConfirmation, modalContent } = useConfirmation();

  const handleToggleEnabled = () => {
    const enabled = !app.enabled;
    showConfirmation({
      title: enabled
        ? t`Make ${app.display_name} live?`
        : t`Make ${app.display_name} a draft?`,
      message: enabled
        ? t`People in its groups will be able to open it at ${Urls.dataApp(app.name)}.`
        : t`Nobody will be able to open it until you make it live again. This doesn’t change the app.`,
      confirmButtonText: enabled ? t`Make live` : t`Make draft`,
      confirmButtonProps: { color: "brand" },
      onConfirm: async () => {
        const { error } = await setDataAppEnabled({ name: app.name, enabled });
        if (error) {
          sendErrorToast(t`Failed to update ${app.display_name}`);
        } else {
          sendSuccessToast(
            enabled
              ? t`${app.display_name} is live`
              : t`${app.display_name} is a draft`,
          );
        }
      },
    });
  };

  const handleTargetClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <Menu position="bottom-start">
        <Menu.Target>
          <MoreMenuButton
            aria-label={t`Data app options`}
            onClick={handleTargetClick}
          />
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          {isDataAppOpenable(app) && (
            <Menu.Item
              component="a"
              href={Urls.getSubpathSafeUrl(Urls.dataApp(app.name))}
              target="_blank"
              rel="noreferrer"
              leftSection={<Icon name="external" />}
            >
              {t`Open app`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={
              <Icon name={app.enabled ? "eye_crossed_out" : "eye"} />
            }
            onClick={handleToggleEnabled}
          >
            {app.enabled ? t`Make draft` : t`Make live`}
          </Menu.Item>
          <Menu.Item
            component="a"
            href={Urls.getSubpathSafeUrl(Urls.dataAppGroupsSettings(app.name))}
            target="_blank"
            rel="noreferrer"
            leftSection={<Icon name="external" />}
          >
            {t`Manage group access`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
