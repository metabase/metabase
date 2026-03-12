import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

export function ToolsMenu() {
  return (
    <Menu>
      <Menu.Target>
        <Button leftSection={<Icon name="gear" />}>{t`Tools`}</Button>
      </Menu.Target>
    </Menu>
  );
}
