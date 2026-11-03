import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { NotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { Box, Button, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { CUSTOMERS_ID, WAREHOUSE_ID, createWarehouse } from "./fixtures";

const NATIVE_PREVIEW_WIDTH = 520;

function createCustomersQuestion() {
  const metadata = createMockMetadata({
    databases: [createWarehouse({ withPropertyColumns: true })],
  });
  const provider = Lib.metadataProvider(WAREHOUSE_ID, metadata);
  const table = checkNotNull(Lib.tableOrCardMetadata(provider, CUSTOMERS_ID));
  const query = Lib.queryFromTableOrCardMetadata(provider, table);
  return new Question(
    createMockCard({ name: t`Customers`, display: "table" }),
    metadata,
  ).setQuery(query);
}

const RESULT_SERIES: RawSeries = [
  {
    card: createMockCard({
      name: "Pro and Enterprise customers with over 50 seats, by region",
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["region"],
        "graph.metrics": ["count"],
        "graph.show_values": true,
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "region",
          display_name: "Custom properties → Region",
          base_type: "type/Text",
          semantic_type: "type/Category",
          source: "breakout",
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/BigInteger",
          semantic_type: "type/Quantity",
          source: "aggregation",
        }),
      ],
      rows: [
        ["AMER", 61],
        ["EMEA", 41],
        ["APAC", 17],
      ],
    }),
  },
];

export function QueryBuilderPrototype() {
  const [question, setQuestion] = useState(createCustomersQuestion);
  const [isShowingResult, { open: showResult, close: showNotebook }] =
    useDisclosure(false);
  const [isShowingSql, { toggle: toggleSql }] = useDisclosure(false);

  return (
    <Stack h="100vh" gap={0} bg="background_page-primary">
      <Group
        px="xl"
        py="md"
        justify="space-between"
        bd="none"
        style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Group gap="sm">
          <Icon name="table2" c="core-brand" />
          <Title order={3}>{question.displayName()}</Title>
        </Group>
        <Group gap="sm">
          {isShowingResult ? (
            <Button
              leftSection={<Icon name="notebook" />}
              onClick={showNotebook}
            >{t`Editor`}</Button>
          ) : (
            <Button
              leftSection={<Icon name="sql" />}
              variant={isShowingSql ? "filled" : "default"}
              onClick={toggleSql}
            >{t`View SQL`}</Button>
          )}
        </Group>
      </Group>
      <Flex flex={1} mih={0}>
        {isShowingResult ? (
          <Box flex={1} p="xl" h="100%">
            <Visualization rawSeries={RESULT_SERIES} showTitle />
          </Box>
        ) : (
          <>
            <Box flex={1} style={{ overflowY: "auto" }}>
              <Notebook
                question={question}
                isDirty
                isRunnable
                isResultDirty
                reportTimezone="UTC"
                hasVisualizeButton
                updateQuestion={async (nextQuestion) =>
                  setQuestion(nextQuestion)
                }
                runQuestionQuery={async () => showResult()}
                setQueryBuilderMode={() => undefined}
              />
            </Box>
            {isShowingSql && (
              <Box
                w={NATIVE_PREVIEW_WIDTH}
                style={{
                  borderLeft: "1px solid var(--mb-color-border-neutral)",
                }}
              >
                <NotebookNativePreview
                  question={question}
                  onConvertClick={() => undefined}
                />
              </Box>
            )}
          </>
        )}
      </Flex>
    </Stack>
  );
}
