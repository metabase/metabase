import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import type {
  DataSelectorDatabase,
  DataSelectorSchema,
} from "metabase/querying/common/components/DataSelector";
import { Box, Flex, Icon } from "metabase/ui";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { SchemaId } from "metabase-types/api";

import { CONTAINER_WIDTH } from "../constants";

type DataSelectorSchemaPickerProps = {
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  schemas: DataSelectorSchema[];
  selectedDatabase?: DataSelectorDatabase | null;
  selectedSchemaId?: SchemaId | null;
  onBack?: (() => void) | null;
  onChangeSchema: (schema?: DataSelectorSchema) => void;
};

type Item = {
  name: string | null;
  schema: DataSelectorSchema;
};

export const DataSelectorSchemaPicker = ({
  schemas,
  selectedDatabase,
  selectedSchemaId,
  onBack,
  onChangeSchema,
  hasNextStep,
  hasInitialFocus,
}: DataSelectorSchemaPickerProps) => {
  const tc = useTranslateContent();
  const sections: Section<Item>[] = [
    {
      name: (
        <Flex
          align="center"
          style={{ cursor: "pointer" }}
          onClick={onBack ?? undefined}
        >
          {onBack && <Icon name="chevronleft" size={18} />}
          <Box component="span" ml="sm">
            {selectedDatabase && tc(selectedDatabase.name)}
          </Box>
        </Flex>
      ),
      type: "back",
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
