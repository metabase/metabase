import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";

import { FieldSection } from "./FieldSection";
import { PreviewSection } from "./PreviewSection";
import { TableSection } from "./TableSection";

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
        <TableSection
          databaseId={databaseId}
          fieldId={fieldId}
          schemaId={schemaId}
          tableId={tableId}
        />
      </Box>

      <Flex bg="accent-gray-light" flex="1">
        <Box flex="0 0 400px" px="xl" py="lg">
          <FieldSection fieldId={fieldId} />
        </Box>

        <Box flex="1" p="xl" pl={0}>
          <PreviewSection fieldId={fieldId} />
        </Box>
      </Flex>
    </Flex>
  );
};
