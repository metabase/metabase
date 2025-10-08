import { Box, Stack, Text, Loader } from "metabase/ui";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Table } from "@mantine/core";
import { useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { skipToken } from "metabase/api";
import type { Card, Dataset } from "metabase-types/api";

interface ModelsDetailsProps {
  model?: Card;
}

export function ModelsDetails({ model }: ModelsDetailsProps) {
  // Load the model definition
  const { data: modelData, isLoading: isLoadingModel } = useGetCardQuery(
    model?.id ? { id: model.id } : skipToken,
  );

  // Run the model query to get results
  const { data: queryResults, isLoading: isLoadingResults } =
    useGetCardQueryQuery(
      model?.id
        ? {
            cardId: model.id,
            parameters: [],
            ignore_cache: false,
          }
        : skipToken,
    );

  if (!model) {
    return (
      <Box
        h="100%"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text size="lg">Select a model to view its definition and results</Text>
      </Box>
    );
  }

  if (isLoadingModel) {
    return (
      <Box
        h="100%"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text>Loading model...</Text>
      </Box>
    );
  }

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Stack h="100%" gap="md">
        {/* Model Definition - Notebook Mode */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,

            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Box
            p="md"
            style={{
              borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
              backgroundColor: isDark
                ? theme.colors.dark[6]
                : theme.colors.gray[0],
            }}
          >
            <Text size="lg" fw="bold">
              {model.name}
            </Text>
            <Text size="sm">Model Definition</Text>
          </Box>

          <Box style={{ flex: 1, height: "400px" }}>
            <CodeMirror
              value={
                modelData?.dataset_query
                  ? JSON.stringify(modelData.dataset_query, null, 2)
                  : "No query definition available"
              }
              options={{
                readOnly: true,
                mode: "application/json",
                lineNumbers: true,
                theme: isDark ? "material-darker" : "default",
              }}
            />
          </Box>
        </Box>

        {/* Query Results */}
        <Box
          style={{
            height: "300px",
            border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Box
            p="md"
            style={{
              borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
              backgroundColor: isDark
                ? theme.colors.dark[6]
                : theme.colors.gray[0],
            }}
          >
            <Text size="lg" fw="bold">
              Query Results
            </Text>
            <Text size="sm">Model execution output</Text>
          </Box>

          <Box style={{ height: "calc(100% - 60px)", overflow: "auto" }}>
            {isLoadingResults ? (
              <Box p="md" ta="center">
                <Loader size="sm" />
                <Text mt="sm">Running query...</Text>
              </Box>
            ) : queryResults ? (
              <Box p="md">
                <Text size="sm" mb="sm">
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
                                  <Text fs="italic">null</Text>
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
                  <Text>No data returned</Text>
                )}
              </Box>
            ) : (
              <Box p="md" ta="center">
                <Text>No results available</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
