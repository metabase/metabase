import React from "react";

import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import Field from "metabase-lib/lib/metadata/Field";

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
      <DimensionInfo dimension={field.dimension()} showAllFieldValues />
    </SidebarContent>
  );
};

export default FieldPane;
