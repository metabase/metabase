import { TableColumnInfo } from "metabase/components/MetadataInfo/ColumnInfo";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Field from "metabase-lib/v1/metadata/Field";

import { PaneContent } from "./Pane.styled";

interface FieldPaneProps {
  onBack: () => void;
  onClose: () => void;
  field: Field;
}

const FieldPane = ({ onBack, onClose, field }: FieldPaneProps) => {
  return (
    <SidebarContent
      title={field.name}
      icon={"field"}
      onBack={onBack}
      onClose={onClose}
    >
      <PaneContent>
        <TableColumnInfo
          field={field}
          timezone={field.table?.database?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </PaneContent>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldPane;
