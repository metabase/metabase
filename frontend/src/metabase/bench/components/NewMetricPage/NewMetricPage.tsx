import { Box, Stack, Text, useMantineTheme, Button, Group } from "metabase/ui";
import { useState, useMemo, useCallback } from "react";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { useSetting } from "metabase/common/hooks";
import { Icon } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

export function NewMetricPage() {
  const theme = useMantineTheme();
  const isDark = theme.colorScheme === "dark";
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSetting("report-timezone-long");

  // Create an empty ad-hoc question for metric creation
  const initialQuery: DatasetQuery = {
    type: "query",
    database: null,
    query: {
      "source-table": null,
    },
  };

  const [question, setQuestion] = useState<Question>(() =>
    Question.create({ dataset_query: initialQuery, metadata }),
  );

  const [isRunnable, setIsRunnable] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isResultDirty, setIsResultDirty] = useState(false);

  const handleUpdateQuestion = useCallback(async (newQuestion: Question) => {
    setQuestion(newQuestion);
    setIsDirty(true);
    setIsResultDirty(true);

    // Check if the question is runnable (has a source table selected)
    const queryInfo = Lib.queryDisplayInfo(newQuestion.query());
    setIsRunnable(!!queryInfo.isEditable);
  }, []);

  const handleRunQuery = useCallback(async () => {
    // This would normally run the query and show results
    console.log("Running query for metric:", question.query());
  }, [question]);

  const handleSaveMetric = useCallback(() => {
    // This would normally save the metric
    console.log("Saving metric:", question);
    // For now, just navigate back to metrics list
  }, [question]);

  const handleCancel = useCallback(() => {
    alert("Cancel");
  }, []);

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Stack h="100%" gap="md">
        {/* Header with title and actions */}
        <Box
          p="md"
          style={{
            borderBottom: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
            backgroundColor: isDark
              ? theme.colors.dark[6]
              : theme.colors.gray[0],
          }}
        >
          <Group position="apart">
            <Box>
              <Text size="xl" fw="bold">
                New Metric
              </Text>
              <Text size="sm" c="dimmed">
                Create a new metric using the notebook editor
              </Text>
            </Box>

            <Group>
              <Button variant="subtle" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="filled"
                leftIcon={<Icon name="check" />}
                onClick={handleSaveMetric}
                disabled={!isRunnable}
              >
                Save Metric
              </Button>
            </Group>
          </Group>
        </Box>

        {/* Notebook Editor */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
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
              Metric Definition
            </Text>
            <Text size="sm" c="dimmed">
              Use the notebook editor to define your metric calculation
            </Text>
          </Box>

          <Box
            style={{ flex: 1, height: "calc(100% - 60px)", overflow: "auto" }}
          >
            {question && (
              <Notebook
                question={question}
                updateQuestion={handleUpdateQuestion}
                runQuestionQuery={handleRunQuery}
                isDirty={isDirty}
                isRunnable={isRunnable}
                isResultDirty={isResultDirty}
                reportTimezone={reportTimezone}
                hasVisualizeButton={true}
                readOnly={false}
              />
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
