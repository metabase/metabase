import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon, Menu } from "metabase/ui";

export const CreateModelMenu = () => {
  return (
    <Menu>
      <Menu.Target>
        <Button
          leftSection={<Icon name="add" />}
          size="sm"
          aria-label={t`Create a new model`}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Create your model with…`}</Menu.Label>
        <Menu.Item
          component={ForwardRefLink}
          to={"/bench/model/new/query"}
          leftSection={<Icon name="notebook" />}
        >
          {t`Query builder`}
        </Menu.Item>
        <Menu.Item
          component={ForwardRefLink}
          to={"/bench/model/new/native"}
          leftSection={<Icon name="sql" />}
        >
          {t`SQL query`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
