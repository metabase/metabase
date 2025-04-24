import * as Urls from "metabase/lib/urls";
import { Box, Flex, Title } from "metabase/ui";

interface RouteParams {
  databaseId?: string;
  fieldId?: string;
  schemaId?: string;
  tableId?: string;
}

interface Props {
  params: RouteParams;
}

const DATA_MODEL_APP_NAV_BAR_HEIGHT = 53;

export const DataModel = ({ params }: Props) => {
  const databaseId = Urls.extractEntityId(params.databaseId);
  const schemaId = params.schemaId;
  const tableId = Urls.extractEntityId(params.tableId);
  const fieldId = Urls.extractEntityId(params.fieldId);

  return (
    <Flex h={`calc(100% - ${DATA_MODEL_APP_NAV_BAR_HEIGHT}px)`}>
      <Box flex="0 0 400px" px="xl" py="lg">
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

      <Box bg="accent-gray-light" flex="1">
        Main container
      </Box>
    </Flex>
  );
};
