import type { ReactNode } from "react";
import { t } from "ttag";

import {
  HoverParent,
  TableColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Icon, DelayGroup } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";

import DataSelectorLoading from "../DataSelectorLoading";

import {
  Container,
  HeaderContainer,
  HeaderName,
} from "./DataSelectorFieldPicker.styled";

type DataSelectorFieldPickerProps = {
  fields: Field[];
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  isLoading?: boolean;
  selectedField?: Field;
  selectedTable?: Table;
  onBack: () => void;
  onChangeField: (field: Field) => void;
};

type HeaderProps = {
  onBack: DataSelectorFieldPickerProps["onBack"];
  selectedTable: DataSelectorFieldPickerProps["selectedTable"];
};

type FieldWithName = {
  name: string;
  field: Field;
};

const DataSelectorFieldPicker = ({
  isLoading,
  fields,
  selectedTable,
  selectedField,
  onChangeField,
  onBack,
  hasFiltering,
  hasInitialFocus,
}: DataSelectorFieldPickerProps) => {
  const header = <Header onBack={onBack} selectedTable={selectedTable} />;

  if (isLoading) {
    return <DataSelectorLoading header={header} />;
  }

  const sections = [
    {
      name: header,
      items: fields.map(field => ({
        name: field.displayName(),
        field: field,
      })),
    },
  ];

  const checkIfItemIsSelected = (item: FieldWithName) =>
    item.field && selectedField && item.field.id === selectedField.id;

  const renderItemIcon = (item: FieldWithName) =>
    item.field && (
      <TableColumnInfoIcon
        field={item.field}
        position="top-end"
        size={18}
        icon={item.field.dimension().icon() as unknown as IconName}
      />
    );

  return (
    <Container>
      <DelayGroup>
        <AccordionList
          id="FieldPicker"
          key="fieldPicker"
          className={CS.textBrand}
          hasInitialFocus={hasInitialFocus}
          sections={sections}
          maxHeight={Infinity}
          width="100%"
          searchable={hasFiltering}
          onChange={(item: { field: Field }) => onChangeField(item.field)}
          itemIsSelected={checkIfItemIsSelected}
          itemIsClickable={(item: FieldWithName) => item.field}
          renderItemWrapper={renderItemWrapper}
          renderItemIcon={renderItemIcon}
        />
      </DelayGroup>
    </Container>
  );
};

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}

const Header = ({ onBack, selectedTable }: HeaderProps) => (
  <HeaderContainer onClick={onBack}>
    <Icon name="chevronleft" size={18} />
    <HeaderName>{selectedTable?.display_name || t`Fields`}</HeaderName>
  </HeaderContainer>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorFieldPicker;
