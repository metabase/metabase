import { Box, Stack, Text, Button, Group } from "metabase/ui";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { useSetting } from "metabase/common/hooks";
import { Icon } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

export function NewMetricPage() {
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSetting("report-timezone-long");

  const [question, setQuestion] = useState<Question | null>(null);

  const [isRunnable, setIsRunnable] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isResultDirty, setIsResultDirty] = useState(false);

  // Create Question when metadata is available
  useEffect(() => {
    if (metadata && metadata.databasesList().length > 0) {
      // Get the first available database
      const firstDatabase = metadata.databasesList()[0];

      // Create a new Question with the first available database
      const newQuestion = Question.create({
        databaseId: firstDatabase.id,
        metadata,
      });

      setQuestion(newQuestion);
    }
  }, [metadata]);

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
        <Box>
          <Group position="apart" style={{ borderBottom: "1px solid var(--mb-color-border)" }}>
            <Box>
              New metric
            </Box>

            <Group ml="auto">
              <Button variant="subtle" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="filled"
                leftIcon={<Icon name="check" />}
                onClick={handleSaveMetric}
                disabled={!isRunnable}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Box>

        {/* Notebook Editor */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Box
            style={{ flex: 1, height: "calc(100% - 60px)", overflow: "auto" }}
          >
            {question ? (
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
            ) : (
              <Box
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <Text>Loading notebook editor...</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
