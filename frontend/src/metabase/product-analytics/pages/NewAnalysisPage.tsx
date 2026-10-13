import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { Alert, Box, Icon, SimpleGrid, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId } from "metabase-types/api";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import { AnalysisTypeCard } from "../components/AnalysisTypeCard";
import { EventTablePicker } from "../components/EventTablePicker";
import { PROTOTYPE_TABLE_NAME } from "../config";
import { usePrototypeTable } from "../use-prototype-table";

export const NewAnalysisPage = () => {
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const prototype = usePrototypeTable();
  const tableId = prototype.tableId;

  // Prototype: event definitions don't follow a table change yet, so analyses
  // stay on one table. Lift this once they do.
  const handleTableChange = (id: ConcreteTableId) => {
    if (id !== tableId) {
      sendToast({
        icon: "warning",
        message: t`For now, only ${PROTOTYPE_TABLE_NAME} can be analyzed.`,
      });
    }
  };

  return (
    <Box flex={1} mih="100%" bg="background-secondary" px="xl" py="3rem">
      <Stack h="100%" maw={824} mx="auto" gap="3rem">
        <Stack gap="lg" align="flex-start">
          <Title order={2}>{t`Pick the event data to analyze`}</Title>
          <EventTablePicker
            tableId={tableId}
            isLoading={prototype.isLoading}
            onChange={handleTableChange}
          />
          {prototype.error && (
            <Alert color="error" icon={<Icon name="warning" />}>
              {prototype.error}
            </Alert>
          )}
        </Stack>

        <Stack gap="lg">
          <Title order={2}>{t`Choose the type of analysis to do`}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {ANALYSIS_KINDS.map((kind) => (
              <AnalysisTypeCard
                key={kind}
                config={getAnalysisConfig(kind)}
                disabled={tableId === undefined}
                onSelect={() => {
                  if (tableId !== undefined) {
                    navigate(Urls.eventAnalysis(kind, tableId));
                  }
                }}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Stack>
    </Box>
  );
};
