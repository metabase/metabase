import {
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import { Icon } from "metabase/ui";
import { useState, forwardRef, useImperativeHandle } from "react";
import { useGetAdhocQueryQuery } from "metabase/api";
import { skipToken } from "metabase/api";
import type { DatasetQuery, Dataset } from "metabase-types/api";

interface QueryPreviewProps {
  query: string;
  databaseId?: number | null;
  onRunQuery?: () => void;
}

interface QueryPreviewRef {
  runQuery: () => void;
}

export const QueryPreview = forwardRef<QueryPreviewRef, QueryPreviewProps>(
  function QueryPreview({ query, databaseId, onRunQuery }, ref) {
    const [shouldExecute, setShouldExecute] = useState(false);

    const datasetQuery: DatasetQuery | typeof skipToken =
      databaseId && shouldExecute
        ? {
            type: "native",
            native: {
              query: query.trim(),
            },
            database: databaseId,
          }
        : skipToken;

    const {
      data: dataset,
      isLoading,
      error,
      refetch,
    } = useGetAdhocQueryQuery(datasetQuery, {
      skip: !shouldExecute || !databaseId || !query.trim(),
    });

    const handleRunQuery = () => {
      if (databaseId && query.trim()) {
        setShouldExecute(true);
        onRunQuery?.();
        if (shouldExecute) {
          refetch();
        }
      }
    };

    const handleClearResults = () => {
      setShouldExecute(false);
    };

    useImperativeHandle(ref, () => ({
      runQuery: handleRunQuery,
    }));

    if (!databaseId) {
      return (
        <Box p="md" style={{ textAlign: "center" }}>
          <Text size="sm">Select a transform to preview queries</Text>
        </Box>
      );
    }

    return (
      <Stack gap="md" h="100%">
        <Group
          justify="space-between"
          p="md"
          style={{
            borderBottom: `1px solid var(--mb-color-border)`,
            backgroundColor: "var(--mb-color-bg-light)",
          }}
        >
          <Group gap="sm">
            <Text fw={500} size="sm">
              Query Preview
            </Text>
            {isLoading && <Loader size="xs" />}
          </Group>
          <Group gap="sm">
            <Button
              size="xs"
              variant="filled"
              leftSection={<Icon name="play" size={12} />}
              onClick={handleRunQuery}
              disabled={!query.trim() || isLoading}
            >
              Run (⌘↵)
            </Button>
            {shouldExecute && (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<Icon name="close" size={12} />}
                onClick={handleClearResults}
              >
                Clear
              </Button>
            )}
          </Group>
        </Group>

        <Box style={{ flex: 1, overflow: "auto" }} p="md">
          {error && (
            <Box
              p="md"
              style={{
                backgroundColor: "var(--mb-color-bg-error)",
                border: "1px solid var(--mb-color-border-error)",
                borderRadius: "4px",
              }}
            >
              <Group gap="sm" align="flex-start">
                <Icon
                  name="warning"
                  size={16}
                  color="var(--mb-color-text-error)"
                />
                <Stack gap="xs">
                  <Text fw={500} size="sm" c="error">
                    Query Error
                  </Text>
                  <Text size="sm" c="error">
                    {error && typeof error === "object" && "data" in error
                      ? (error.data as any)?.message || "Unknown error occurred"
                      : String(error)}
                  </Text>
                </Stack>
              </Group>
            </Box>
          )}

          {isLoading && (
            <Box style={{ textAlign: "center" }} py="xl">
              <Loader size="md" />
              <Text size="sm" mt="md">
                Executing query...
              </Text>
            </Box>
          )}

          {dataset && !isLoading && !error && (
            <Box>
              <Group mb="md" gap="md">
                <Text size="sm" fw={500}>
                  Results: {dataset.data.rows.length} rows
                </Text>
                <Text size="sm">{dataset.data.cols.length} columns</Text>
                {dataset.running_time && (
                  <Text size="sm">{dataset.running_time}ms</Text>
                )}
              </Group>

              {dataset.data.rows.length > 0 ? (
                <Box
                  style={{
                    overflowX: "auto",
                    border: "1px solid var(--mb-color-border)",
                    borderRadius: "4px",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          backgroundColor: "var(--mb-color-bg-light)",
                        }}
                      >
                        {dataset.data.cols.map((col, index) => (
                          <th
                            key={index}
                            style={{
                              padding: "8px 12px",
                              textAlign: "left",
                              borderRight:
                                index < dataset.data.cols.length - 1
                                  ? "1px solid var(--mb-color-border)"
                                  : "none",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            {col.display_name || col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.data.rows.slice(0, 100).map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          style={{
                            borderBottom:
                              rowIndex <
                              Math.min(dataset.data.rows.length, 100) - 1
                                ? "1px solid var(--mb-color-border)"
                                : "none",
                          }}
                        >
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              style={{
                                padding: "8px 12px",
                                borderRight:
                                  cellIndex < row.length - 1
                                    ? "1px solid var(--mb-color-border)"
                                    : "none",
                                fontSize: "12px",
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cell === null ? (
                                <Text size="xs" fs="italic">
                                  null
                                </Text>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dataset.data.rows.length > 100 && (
                    <Box
                      p="md"
                      style={{
                        textAlign: "center",
                        backgroundColor: "var(--mb-color-bg-light)",
                      }}
                    >
                      <Text size="sm">
                        Showing first 100 of {dataset.data.rows.length} rows
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box
                  p="md"
                  style={{
                    textAlign: "center",
                    backgroundColor: "var(--mb-color-bg-light)",
                    border: "1px solid var(--mb-color-border)",
                    borderRadius: "4px",
                  }}
                >
                  <Text size="sm">
                    Query executed successfully but returned no rows
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {!shouldExecute && (
            <Box style={{ textAlign: "center" }} py="xl">
              <Icon name="play" size={32} color="var(--mb-color-text-light)" />
              <Text size="sm" mt="md">
                Press ⌘↵ or click Run to execute the query
              </Text>
            </Box>
          )}
        </Box>
      </Stack>
    );
  },
);
