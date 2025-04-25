import { Box, Title } from "metabase/ui";
import type {
  DatabaseId,
  FieldId,
  SchemaId,
  TableId,
} from "metabase-types/api";

interface Props {
  databaseId?: DatabaseId;
  fieldId?: FieldId;
  schemaId?: SchemaId;
  tableId?: TableId;
}

export const TableSection = ({
  databaseId,
  fieldId,
  schemaId,
  tableId,
}: Props) => {
  return (
    <Box>
      <Title mb="md" order={2}>
        Data model
      </Title>

      <Box>
        <Box>Database: {databaseId ?? "undefined"}</Box>
        <Box>Schema: {schemaId ?? "undefined"}</Box>
        <Box>Table: {tableId ?? "undefined"}</Box>
        <Box>Field: {fieldId ?? "undefined"}</Box>
      </Box>
    </Box>
  );
};
