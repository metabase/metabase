import { Link } from "react-router";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Button, Icon, Menu } from "metabase/ui";

export function WorkspaceHelpMenu() {
  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  if (!showFileBasedDevLink && !showRemoteSyncLink) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <Button rightSection={<Icon name="chevrondown" />}>{t`Help`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {showFileBasedDevLink && (
          <Menu.Item
            component={Link}
            to={fileBasedDevDocsUrl}
            target="_blank"
            rel="noreferrer"
            leftSection={<Icon name="reference" />}
          >
            {t`File-based development`}
          </Menu.Item>
        )}
        {showRemoteSyncLink && (
          <Menu.Item
            component={Link}
            to={remoteSyncDocsUrl}
            target="_blank"
            rel="noreferrer"
            leftSection={<Icon name="reference" />}
          >
            {t`Using remote sync`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
