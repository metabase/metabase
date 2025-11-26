import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type { Table } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "../../../common/components/PaneHeader";
import { NAME_MAX_LENGTH } from "../../constants";

type TableHeaderProps = {
  table: Table;
};

export function TableHeader({ table }: TableHeaderProps) {
  return (
    <PaneHeader
      data-testid="table-header"
      title={<TableNameInput table={table} />}
      icon="table"
      tabs={<TableTabs table={table} />}
    />
  );
}

type TableNameInputProps = {
  table: Table;
  onChangeName?: (name: string) => void;
};

function TableNameInput({ table }: TableNameInputProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateTable({
      id: table.id,
      display_name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update table name`);
    } else {
      sendSuccessToast(t`Table name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={table.display_name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}

type TableTabsProps = {
  table: Table;
};

function TableTabs({ table }: TableTabsProps) {
  const tabs = getTabs(table);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(table: Table): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [];
  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id),
  });

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioTableDependencies(table.id),
    });
  }

  return tabs;
}
