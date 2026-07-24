import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import CS from "metabase/css/core/index.css";
import { getColumnQueries } from "metabase/querying/common/utils";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, DelayGroup, Icon } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { IconName } from "metabase-types/api";

import { DataSelectorLoading } from "../DataSelectorLoading";
import { CONTAINER_WIDTH } from "../constants";

import DataSelectorFieldPickerS from "./DataSelectorFieldPicker.module.css";

const STAGE_INDEX = -1;

type DataSelectorFieldPickerProps = {
  fields: Field[];
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  isLoading?: boolean;
  selectedField?: Field;
  selectedTable?: Table;
  onBack?: () => void;
  onChangeField: (field: Field) => void;
};

type HeaderProps = {
  onBack?: DataSelectorFieldPickerProps["onBack"];
  selectedTable: DataSelectorFieldPickerProps["selectedTable"];
};

type FieldWithName = {
  name: string;
  field: Field;
};

export const DataSelectorFieldPicker = ({
  isLoading,
  fields,
  selectedTable,
  selectedField,
  onChangeField,
  onBack,
  hasFiltering,
  hasInitialFocus,
}: DataSelectorFieldPickerProps) => {
  const metadata = useSelector(getMetadata);
  const columnQueries = useMemo(
    () =>
      getColumnQueries(
        metadata,
        selectedTable,
        fields.map((field) => field.getPlainObject()),
      ),
    [metadata, selectedTable, fields],
  );

  const header = <Header onBack={onBack} selectedTable={selectedTable} />;

  if (isLoading) {
    return <DataSelectorLoading header={header} />;
  }

  const sections = [
    {
      name: header,
      items: fields.map((field) => ({
        name: field.displayName(),
        field: field,
      })),
    },
  ];

  const checkIfItemIsSelected = (item: FieldWithName) =>
    item.field && selectedField && item.field.id === selectedField.id;

  const renderItemIcon = (item: FieldWithName) => {
    const columnQuery = columnQueries.get(item.field.getPlainObject());
    return (
      columnQuery && (
        <QueryColumnInfoIcon
          query={columnQuery.query}
          stageIndex={STAGE_INDEX}
          column={columnQuery.column}
          position="top-end"
          size={18}
          // Unjustified type cast. FIXME
          icon={item.field.icon() as unknown as IconName}
        />
      )
    );
  };

  return (
    <Box w={CONTAINER_WIDTH} className={DataSelectorFieldPickerS.Container}>
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
          itemIsClickable={(item: FieldWithName) => Boolean(item.field)}
          renderItemWrapper={renderItemWrapper}
          renderItemIcon={renderItemIcon}
        />
      </DelayGroup>
    </Box>
  );
};

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}

const Header = ({ onBack, selectedTable }: HeaderProps) => (
  <Box className={DataSelectorFieldPickerS.HeaderContainer} onClick={onBack}>
    {onBack && <Icon name="chevronleft" size={18} />}
    <Box component="span" className={DataSelectorFieldPickerS.HeaderName}>
      {selectedTable?.display_name || t`Fields`}
    </Box>
  </Box>
);
