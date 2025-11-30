import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PaneHeaderInput } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Table } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";

type TableNameInputProps = {
  table: Table;
  onChangeName?: (name: string) => void;
};

export function TableNameInput({ table }: TableNameInputProps) {
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
      data-testid="table-name-input"
      onChange={handleChangeName}
    />
  );
}
