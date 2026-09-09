import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useIsRemoteSyncReadOnly } from "metabase/common/worktrees";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Button, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

export function TransformToolsMenu() {
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncReadOnly = useIsRemoteSyncReadOnly();

  if (!isAdmin) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <Tooltip
          label={t`Transform tools can't be used when Remote Sync is in read-only mode`}
          disabled={!isRemoteSyncReadOnly}
        >
          <Button
            leftSection={<Icon name="gear" />}
            disabled={isRemoteSyncReadOnly}
          >
            {t`Tools`}
          </Button>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          to={Urls.transformMigrateModels()}
          leftSection={<Icon name="model" />}
        >
          {t`Migrate models`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
