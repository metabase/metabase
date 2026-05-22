import { Link } from "react-router";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Button, FixedSizeIcon, Menu } from "metabase/ui";

export function HelpMenu() {
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
        <Button
          rightSection={<FixedSizeIcon name="chevrondown" aria-hidden />}
        >{t`Help`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {showFileBasedDevLink && (
          <Menu.Item
            component={Link}
            to={fileBasedDevDocsUrl}
            target="_blank"
            rel="noreferrer"
            leftSection={<FixedSizeIcon name="reference" aria-hidden />}
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
            leftSection={<FixedSizeIcon name="reference" aria-hidden />}
          >
            {t`Using remote sync`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
