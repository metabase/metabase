import { useState } from "react";
import { t } from "ttag";

import { useNavigate } from "metabase/router";
import { Box, SimpleGrid, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId } from "metabase-types/api";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import { AnalysisTypeCard } from "../components/AnalysisTypeCard";
import { EventTablePicker } from "../components/EventTablePicker";
import { usePrototypeTable } from "../use-prototype-table";

export const NewAnalysisPage = () => {
  const navigate = useNavigate();
  const prototype = usePrototypeTable();
  const [tableId, setTableId] = useState<ConcreteTableId | undefined>();
  const selectedTableId = tableId ?? prototype.tableId;

  return (
    <Box p="xl" maw={1100} mx="auto">
      <Stack gap="xl">
        <Stack gap="md">
          <Title order={2}>{t`Pick the event data to analyze`}</Title>
          <EventTablePicker tableId={selectedTableId} onChange={setTableId} />
        </Stack>

        <Stack gap="md">
          <Title order={2}>{t`Choose the type of analysis to do`}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {ANALYSIS_KINDS.map((kind) => {
              const config = getAnalysisConfig(kind);
              return (
                <AnalysisTypeCard
                  key={kind}
                  config={config}
                  disabled={selectedTableId === undefined}
                  onSelect={() => {
                    if (selectedTableId !== undefined) {
                      navigate(Urls.eventAnalysis(kind, selectedTableId));
                    }
                  }}
                />
              );
            })}
          </SimpleGrid>
        </Stack>
      </Stack>
    </Box>
  );
};
