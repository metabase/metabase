import { AccordionList } from "metabase/common/components/AccordionList";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import type { DataSelectorSchema } from "metabase/querying/common/components/DataSelector";
import { Box, Icon } from "metabase/ui";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { SchemaId } from "metabase-types/api";

import { CONTAINER_WIDTH } from "../constants";

type DataSelectorSchemaPickerProps = {
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  schemas: DataSelectorSchema[];
  selectedSchemaId?: SchemaId | null;
  onChangeSchema: (schema?: DataSelectorSchema) => void;
};

export const DataSelectorSchemaPicker = ({
  schemas,
  selectedSchemaId,
  onChangeSchema,
  hasNextStep,
  hasFiltering,
  hasInitialFocus,
}: DataSelectorSchemaPickerProps) => {
  const tc = useTranslateContent();
  const sections = [
    {
      items: schemas.map((schema) => ({
        name: tc(getSchemaDisplayName(schema.name)),
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
        onChange={({ schema }: any) => onChangeSchema(schema)}
        itemIsSelected={(item: { schema: DataSelectorSchema }) =>
          item?.schema.id === selectedSchemaId
        }
        renderItemIcon={() => <Icon name="folder_database" size={16} />}
        showItemArrows={hasNextStep}
        maxHeight={Infinity}
      />
    </Box>
  );
};
