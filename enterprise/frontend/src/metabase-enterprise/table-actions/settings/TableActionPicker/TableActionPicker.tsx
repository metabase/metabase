import { t } from "ttag";

import {
  DataPickerModal,
  type DataPickerValue,
} from "metabase/common/components/DataPicker";
import type { TableAction, WritebackAction } from "metabase-types/api";

type TableActionPickerProps = {
  value: WritebackAction | TableAction;
  onChange: (value: WritebackAction | TableAction) => void;
  onClose: () => void;
};

const ENTITY_TYPES: DataPickerValue["model"][] = ["table", "dataset"];

export const TableActionPicker = ({
  value,
  onChange,
  onClose,
}: TableActionPickerProps) => {
  return (
    <DataPickerModal
      databaseId={undefined}
      title={t`Pick action to add`}
      value={undefined}
      models={ENTITY_TYPES}
      onChange={onChange}
      onClose={onClose}
    />
  );
};
