import {
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  useMantineTheme,
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
    const theme = useMantineTheme();
    const isDark = theme.colorScheme === "dark";
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
          <Text size="sm" c="dimmed">
            Select a transform to preview queries
          </Text>
        </Box>
      );
    }

    return (
      <Stack gap="md" h="100%">
        <Group
          justify="space-between"
          p="md"
          style={{
            borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
            backgroundColor: isDark
              ? theme.colors.dark[6]
              : theme.colors.gray[0],
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
                backgroundColor: isDark ? "#2D1B1B" : theme.colors.red[0],
                border: `1px solid ${isDark ? "#5C2E2E" : theme.colors.red[3]}`,
                borderRadius: "4px",
              }}
            >
              <Group gap="sm" align="flex-start">
                <Icon
                  name="warning"
                  size={16}
                  color={isDark ? theme.colors.red[4] : theme.colors.red[6]}
                />
                <Stack gap="xs">
                  <Text fw={500} size="sm" c="red">
                    Query Error
                  </Text>
                  <Text size="sm" c="red">
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
              <Text size="sm" c="dimmed" mt="md">
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
                <Text size="sm" c="dimmed">
                  {dataset.data.cols.length} columns
                </Text>
                {dataset.running_time && (
                  <Text size="sm" c="dimmed">
                    {dataset.running_time}ms
                  </Text>
                )}
              </Group>

              {dataset.data.rows.length > 0 ? (
                <Box
                  style={{
                    overflowX: "auto",
                    border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
                    borderRadius: "4px",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          backgroundColor: isDark
                            ? theme.colors.dark[6]
                            : theme.colors.gray[0],
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
                                  ? `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`
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
                                ? `1px solid ${isDark ? theme.colors.dark[5] : theme.colors.gray[2]}`
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
                                    ? `1px solid ${isDark ? theme.colors.dark[5] : theme.colors.gray[2]}`
                                    : "none",
                                fontSize: "12px",
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cell === null ? (
                                <Text size="xs" c="dimmed" fs="italic">
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
                        backgroundColor: isDark
                          ? theme.colors.dark[6]
                          : theme.colors.gray[0],
                      }}
                    >
                      <Text size="sm" c="dimmed">
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
                    backgroundColor: isDark
                      ? theme.colors.dark[6]
                      : theme.colors.gray[0],
                    border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
                    borderRadius: "4px",
                  }}
                >
                  <Text size="sm" c="dimmed">
                    Query executed successfully but returned no rows
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {!shouldExecute && (
            <Box style={{ textAlign: "center" }} py="xl">
              <Icon name="play" size={32} color="var(--mantine-color-gray-4)" />
              <Text size="sm" c="dimmed" mt="md">
                Press ⌘↵ or click Run to execute the query
              </Text>
            </Box>
          )}
        </Box>
      </Stack>
    );
  },
);
