import { Link } from "react-router";
import { t } from "ttag";

import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon, Menu, Tooltip } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

export function TransformToolsMenu() {
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

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
