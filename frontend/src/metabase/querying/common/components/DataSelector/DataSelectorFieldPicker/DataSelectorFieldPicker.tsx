import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import CS from "metabase/css/core/index.css";
import { useMetadataProvider } from "metabase/metadata-store";
import { getQueryAndColumns } from "metabase/querying/common/utils";
import { Box, DelayGroup, Icon } from "metabase/ui";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type { IconName } from "metabase-types/api";

import { DataSelectorLoading } from "../DataSelectorLoading";
import { CONTAINER_WIDTH } from "../constants";
import type { DataSelectorField, DataSelectorTable } from "../types";

import DataSelectorFieldPickerS from "./DataSelectorFieldPicker.module.css";

const STAGE_INDEX = -1;

type DataSelectorFieldPickerProps = {
  fields: DataSelectorField[];
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  isLoading?: boolean;
  selectedField?: DataSelectorField;
  selectedTable?: DataSelectorTable;
  onBack?: () => void;
  onChangeField: (field: DataSelectorField) => void;
  getFieldDisplayName: (field: DataSelectorField) => string;
};

type HeaderProps = {
  onBack?: DataSelectorFieldPickerProps["onBack"];
  selectedTable: DataSelectorFieldPickerProps["selectedTable"];
};

type FieldWithName = {
  name: string;
  field: DataSelectorField;
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
  getFieldDisplayName,
}: DataSelectorFieldPickerProps) => {
  const metadataProvider = useMetadataProvider(selectedTable?.db_id ?? null);
  const queryAndColumns = useMemo(
    () => getQueryAndColumns(metadataProvider, selectedTable, fields),
    [metadataProvider, selectedTable, fields],
  );

  const header = <Header onBack={onBack} selectedTable={selectedTable} />;

  if (isLoading) {
    return <DataSelectorLoading header={header} />;
  }

  const sections = [
    {
      name: header,
      items: fields.map((field) => ({
        name: getFieldDisplayName(field),
        field: field,
      })),
    },
  ];

  const checkIfItemIsSelected = (item: FieldWithName) =>
    item.field && selectedField && item.field.id === selectedField.id;

  const renderItemIcon = (item: FieldWithName) => {
    const queryAndColumn = queryAndColumns.get(item.field);
    return (
      queryAndColumn && (
        <QueryColumnInfoIcon
          query={queryAndColumn.query}
          stageIndex={STAGE_INDEX}
          column={queryAndColumn.column}
          position="top-end"
          size={18}
          // getIconForField returns one of the icon names in its own
          // mapping, typed as a plain string.
          icon={getIconForField(item.field) as IconName}
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
          onChange={(item: { field: DataSelectorField }) =>
            onChangeField(item.field)
          }
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
