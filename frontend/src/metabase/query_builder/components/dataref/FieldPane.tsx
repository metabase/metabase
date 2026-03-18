import { TableColumnInfo } from "metabase/common/components/MetadataInfo/ColumnInfo";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";

import type { DataReferenceFieldItem, DataReferencePaneProps } from "./types";

export const FieldPane = ({
  onBack,
  onClose,
  field,
}: DataReferencePaneProps<DataReferenceFieldItem>) => {
  return (
    <SidebarContent
      title={field.name}
      icon="field"
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <TableColumnInfo
          field={field}
          timezone={field.table?.database?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
