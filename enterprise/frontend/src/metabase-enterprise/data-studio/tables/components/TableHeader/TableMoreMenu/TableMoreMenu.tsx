import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { UnpublishTablesModal } from "metabase-enterprise/data-studio/common/components/UnpublishTablesModal";
import type { Table } from "metabase-types/api";

type TableModalType = "unpublish";

type TableMoreMenuProps = {
  table: Table;
};

export function TableMoreMenu({ table }: TableMoreMenuProps) {
  const dispatch = useDispatch();
  const [modalType, setModalType] = useState<TableModalType>();

  const handleUnpublish = () => {
    setModalType(undefined);
    dispatch(push(Urls.dataStudioLibrary()));
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm">
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
            onClick={() => setModalType("unpublish")}
          >
            {t`Unpublish`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        tableIds={[table.id]}
        onUnpublish={handleUnpublish}
        onClose={() => setModalType(undefined)}
      />
    </>
  );
}
