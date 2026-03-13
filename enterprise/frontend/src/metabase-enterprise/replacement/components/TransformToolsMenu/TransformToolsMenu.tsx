import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Button, Icon, Menu } from "metabase/ui";

export function TransformToolsMenu() {
  return (
    <Menu>
      <Menu.Target>
        <Button leftSection={<Icon name="gear" />}>{t`Tools`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          to={Urls.transformMigratePersistedModels()}
          leftSection={<Icon name="model" />}
        >
          {t`Migrate persisted models`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
