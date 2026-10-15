import { useState } from "react";
import { t } from "ttag";

import { useLazyGetTableQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { Alert, Box, Icon, SimpleGrid, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId } from "metabase-types/api";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import { AnalysisTypeCard } from "../components/AnalysisTypeCard";
import { EventTablePicker } from "../components/EventTablePicker";
import { usePrototypeTable } from "../use-prototype-table";

export const NewAnalysisPage = () => {
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const prototype = usePrototypeTable();
  const [fetchTable] = useLazyGetTableQuery();
  const [selectedTableId, setSelectedTableId] = useState<ConcreteTableId>();
  const tableId = selectedTableId ?? prototype.tableId;

  // Prototype: the generated SQL is ClickHouse-only. Lift this once SQL
  // generation moves to MBQL.
  const handleTableChange = async (id: ConcreteTableId) => {
    const { data: table } = await fetchTable({ id }, true);
    if (table && prototype.clickHouseDatabaseIds.includes(table.db_id)) {
      setSelectedTableId(id);
    } else {
      sendToast({
        icon: "warning",
        message: t`For now, only tables in ClickHouse databases can be analyzed.`,
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
