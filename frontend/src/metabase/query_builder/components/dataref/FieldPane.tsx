import { TableColumnInfo } from "metabase/common/components/MetadataInfo/ColumnInfo";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import type Field from "metabase-lib/v1/metadata/Field";

interface FieldPaneProps {
  onBack: () => void;
  onClose: () => void;
  field: Field;
}

export const FieldPane = ({ onBack, onClose, field }: FieldPaneProps) => {
  return (
    <SidebarContent
      title={field.name}
      icon={"field"}
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
