import { Link } from "react-router";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon, Menu } from "metabase/ui";

export function TransformToolsMenu() {
  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <Button leftSection={<Icon name="gear" />}>{t`Tools`}</Button>
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
