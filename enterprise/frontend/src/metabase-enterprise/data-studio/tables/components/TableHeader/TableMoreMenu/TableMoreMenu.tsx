import { push } from "react-router-redux";
import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useUnpublishTables } from "metabase-enterprise/data-studio/common/hooks/use-unpublish-tables";
import type { Table } from "metabase-types/api";

type TableMoreMenuProps = {
  table: Table;
};

export function TableMoreMenu({ table }: TableMoreMenuProps) {
  const dispatch = useDispatch();
  const { unpublishModal, handleUnpublish } = useUnpublishTables({
    onUnpublish: () => dispatch(push(Urls.dataStudioModeling())),
  });

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="external" />}
            component={ForwardRefLink}
            to={Urls.queryBuilderTable(table.id, table.db_id)}
            target="_blank"
          >
            {c("A verb, not a noun").t`View`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="unpublish" />}
            onClick={() => handleUnpublish({ tableIds: [table.id] })}
          >
            {t`Unpublish`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {unpublishModal}
    </>
  );
}
