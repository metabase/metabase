import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { SchemaId } from "metabase-types/api";

import { DataSelectorSchemaPickerContainer as Container } from "./DataSelectorSchemaPicker.styled";

type DataSelectorSchemaPickerProps = {
  hasBackButton: boolean;
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  schemas: Schema[];
  selectedSchemaId: SchemaId;
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
        className={CS.textBrand}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorSchemaPicker;
