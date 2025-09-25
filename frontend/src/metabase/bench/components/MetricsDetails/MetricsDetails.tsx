import { Box, Stack, Text, Loader } from "metabase/ui";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Table } from "@mantine/core";
import { useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { skipToken } from "metabase/api";
import type { Card, Dataset } from "metabase-types/api";

interface MetricsDetailsProps {
  params: {
    metricId: string;
  };
}

export function MetricsDetails({ params }: MetricsDetailsProps) {
  const metricId = parseInt(params.metricId, 10);

  // Load the metric definition
  const { data: metricData, isLoading: isLoadingMetric } = useGetCardQuery({
    id: metricId,
  });

  // Run the metric query to get results
  const { data: queryResults, isLoading: isLoadingResults } =
    useGetCardQueryQuery({
      cardId: metricId,
      parameters: [],
      ignore_cache: false,
    });

  if (isLoadingMetric) {
    return (
      <Box
        h="100%"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text size="lg" c="dimmed">
          Loading metric...
        </Text>
      </Box>
    );
  }

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Stack h="100%" gap="md">
        {/* Metric Definition - Notebook Mode */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Box p="md">
            <Text size="lg" fw="bold">
              {metricData?.name}
            </Text>
            <Text size="sm" c="dimmed">
              Metric Definition
            </Text>
          </Box>

          <Box style={{ flex: 1, height: "400px" }}>
            <CodeMirror
              value={
                metricData?.dataset_query
                  ? JSON.stringify(metricData.dataset_query, null, 2)
                  : "No query definition available"
              }
              options={{
                readOnly: true,
                mode: "application/json",
                lineNumbers: true,
              }}
            />
          </Box>
        </Box>

        {/* Query Results */}
        <Box
          style={{
            height: "300px",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Box p="md">
            <Text size="lg" fw="bold">
              Query Results
            </Text>
            <Text size="sm" c="dimmed">
              Metric execution output
            </Text>
          </Box>

          <Box style={{ height: "calc(100% - 60px)", overflow: "auto" }}>
            {isLoadingResults ? (
              <Box p="md" ta="center">
                <Loader size="sm" />
                <Text mt="sm">Running query...</Text>
              </Box>
            ) : queryResults ? (
              <Box p="md">
                <Text size="sm" c="dimmed" mb="sm">
                  {queryResults.data?.rows?.length || 0} rows returned
                </Text>
                {queryResults.data?.rows &&
                queryResults.data.rows.length > 0 ? (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        {queryResults.data.cols.map((col, index) => (
                          <Table.Th key={index}>{col.display_name}</Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {queryResults.data.rows
                        .slice(0, 100)
                        .map((row, rowIndex) => (
                          <Table.Tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <Table.Td key={cellIndex}>
                                {cell === null ? (
                                  <Text c="dimmed" fs="italic">
                                    null
                                  </Text>
                                ) : (
                                  String(cell)
                                )}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text c="dimmed">No data returned</Text>
                )}
              </Box>
            ) : (
              <Box p="md" ta="center">
                <Text c="dimmed">No results available</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
