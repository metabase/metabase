import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

export function NewTransformMenu() {
  return (
    <Menu>
      <Menu.Target>
        <Button variant="filled">{t`Create a transform`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Create your transform with…`}</Menu.Label>
        <Menu.Item leftSection={<Icon name="notebook" />}>
          {t`Query builder`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="sql" />}>{t`SQL query`}</Menu.Item>
        <Menu.Item leftSection={<Icon name="folder" />}>
          {t`A saved question`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
