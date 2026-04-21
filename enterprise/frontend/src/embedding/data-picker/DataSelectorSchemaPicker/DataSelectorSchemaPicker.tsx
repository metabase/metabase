import { AccordionList } from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Icon } from "metabase/ui";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { SchemaId } from "metabase-types/api";

import { CONTAINER_WIDTH } from "../constants";

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
  const tc = useTranslateContent();
  const sections = [
    {
      items: schemas.map((schema) => ({
        name: tc(schema.displayName()),
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
        itemIsSelected={(item: { schema: Schema }) =>
          item?.schema.id === selectedSchemaId
        }
        renderItemIcon={() => <Icon name="folder_database" size={16} />}
        showItemArrows={hasNextStep}
        maxHeight={Infinity}
      />
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorSchemaPicker;
