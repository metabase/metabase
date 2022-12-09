import React from "react";

import Icon from "metabase/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";

import { DataSelectorSchemaPickerContainer as Container } from "./DataSelectorSchemaPicker.styled";

type Schema = { id?: number; displayName: () => string };

type DataSelectorSchemaPickerProps = {
  hasBackButton: boolean;
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  schemas: Schema[];
  selectedSchemaId: number;
  onBack: () => void;
  onChangeSchema: (item: { schema: Schema }) => void;
};

const DataSelectorSchemaPicker = ({
  schemas,
  selectedSchemaId,
  onChangeSchema,
  hasNextStep,
  hasFiltering,
  hasInitialFocus,
}: DataSelectorSchemaPickerProps) => {
  const sections = [
    {
      items: schemas.map(schema => ({
        name: schema.displayName(),
        schema: schema,
      })),
    },
  ];

  return (
    <Container>
      <AccordionList
        id="SchemaPicker"
        key="schemaPicker"
        className="text-brand"
        hasInitialFocus={hasInitialFocus}
        sections={sections}
        searchable={hasFiltering}
        onChange={({ schema }: any) => onChangeSchema(schema)}
        itemIsSelected={(item: { schema: Schema }) =>
          item?.schema.id === selectedSchemaId
        }
        renderItemIcon={() => <Icon name="folder" size={16} />}
        showItemArrows={hasNextStep}
      />
    </Container>
  );
};

export default DataSelectorSchemaPicker;
