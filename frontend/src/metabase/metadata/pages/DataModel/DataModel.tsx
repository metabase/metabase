import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/components/EmptyState";
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
  const isEmptyStateShown = tableId == null || fieldId == null;

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

      {isEmptyStateShown && (
        <Flex align="center" bg="accent-gray-light" flex="1" justify="center">
          <Box maw={320}>
            <EmptyState
              illustrationElement={<img src={EmptyDashboardBot} />}
              title={
                tableId
                  ? t`Edit the table and fields`
                  : t`Start by selecting data to model`
              }
              message={
                tableId
                  ? t`Select a field to edit it. Then change the display name, semantic type or filtering behavior.`
                  : t`Browse your databases to find the table you’d like to edit.`
              }
            />
          </Box>
        </Flex>
      )}

      {!isEmptyStateShown && (
        <Flex bg="accent-gray-light" flex="1">
          <Box flex="0 0 400px" px="xl" py="lg">
            <FieldSection fieldId={fieldId} />
          </Box>

          <Box flex="1" p="xl" pl={0}>
            <PreviewSection fieldId={fieldId} />
          </Box>
        </Flex>
      )}
    </Flex>
  );
};
