import { AccordionList } from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Box, Icon } from "metabase/ui";
import type Schema from "metabase-lib/v1/metadata/Schema";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { SchemaId } from "metabase-types/api";

import { CONTAINER_WIDTH } from "../constants";

type DataSelectorSchemaPickerProps = {
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  schemas: Schema[];
  selectedSchemaId?: SchemaId;
  onChangeSchema: (schema?: Schema) => void;
};

export const DataSelectorSchemaPicker = ({
  schemas,
  selectedSchemaId,
  onChangeSchema,
  hasNextStep,
  hasFiltering,
  hasInitialFocus,
}: DataSelectorSchemaPickerProps) => {
  const sections = [
    {
      items: schemas.map((schema) => ({
        name: getSchemaDisplayName(schema.name),
        schema: schema,
      })),
    },
  ];

  return (
    <Box w={CONTAINER_WIDTH}>
      <AccordionList
        id="SchemaPicker"
        key="schemaPicker"
        className={CS.textBrand}
        hasInitialFocus={hasInitialFocus}
        sections={sections}
        searchable={hasFiltering}
        // keep the search box + "no results" state visible when a search matches no schemas
        globalSearch={hasFiltering}
        onChange={({ schema }: any) => onChangeSchema(schema)}
        itemIsSelected={(item: { schema: Schema }) =>
          item?.schema.id === selectedSchemaId
        }
        renderItemIcon={() => <Icon name="folder" size={16} />}
        showItemArrows={hasNextStep}
        maxHeight={Infinity}
      />
    </Box>
  );
};
