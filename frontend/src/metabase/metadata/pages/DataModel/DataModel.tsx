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

      {(!tableId || !fieldId) && (
        <Flex align="center" bg="accent-gray-light" flex="1" justify="center">
          {!tableId && (
            <EmptyState
              illustrationElement={<img src={EmptyDashboardBot} />}
              title={t`Start by selecting data to model`}
              message={t`Browse your databases to find the table you’d like to edit.`}
            />
          )}

          {tableId && !fieldId && (
            <EmptyState
              illustrationElement={<img src={EmptyDashboardBot} />}
              title={t`Edit the table and fields`}
              message={t`Select a field to edit it. Then change the display name, semantic type or filtering behavior.`}
            />
          )}
        </Flex>
      )}

      {tableId && fieldId && (
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
