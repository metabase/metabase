import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import Field from "metabase-lib/metadata/Field";
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
        <DimensionInfo dimension={field.dimension()} showAllFieldValues />
      </PaneContent>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldPane;
