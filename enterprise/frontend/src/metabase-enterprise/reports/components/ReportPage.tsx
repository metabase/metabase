import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import { Editor } from "./Editor";
import styles from "./ReportPage.module.css";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const ReportPage = () => {
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<
    Array<{ id: number; name: string }>
  >([]);

  // Initialize question run states when new questions are added
  useEffect(() => {
    setQuestionRunStates(prevStates => {
      const newStates = { ...prevStates };
      let hasNewQuestions = false;

      questionRefs.forEach((ref) => {
        if (!newStates[ref.id]) {
          newStates[ref.id] = {
            isRunning: false,
            hasBeenRun: false,
          };
          hasNewQuestions = true;
        }
      });

      return hasNewQuestions ? newStates : prevStates;
    });
  }, [questionRefs]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRunningReport, setIsRunningReport] = useState(false);
  const [questionRunStates, setQuestionRunStates] = useState<Record<number, {
    isRunning: boolean;
    hasBeenRun: boolean;
    lastRunAt?: string;
  }>>({});

  const handleSave = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    const markdown = editorInstance.storage.markdown?.getMarkdown();
    const reportData = {
      title: reportTitle,
      content: markdown,
      questionReferences: questionRefs,
      createdAt: new Date().toISOString(),
    };

    // eslint-disable-next-line no-console
    console.log("Report data to save:", reportData);
  }, [editorInstance, questionRefs, reportTitle]);

  const handleSaveAndRun = useCallback(async () => {
    handleSave();

    if (questionRefs.length === 0) return;

    setIsRunningReport(true);

    // Set all questions to running state
    const runningStates = questionRefs.reduce((acc, ref) => {
      acc[ref.id] = { isRunning: true, hasBeenRun: questionRunStates[ref.id]?.hasBeenRun || false };
      return acc;
    }, {} as Record<number, { isRunning: boolean; hasBeenRun: boolean; lastRunAt?: string }>);

    setQuestionRunStates(prev => ({ ...prev, ...runningStates }));

    // Simulate running each question with a delay
    for (const ref of questionRefs) {
      // Simulate random delay between 1-3 seconds per question
      const delay = Math.random() * 2000 + 1000;

      setTimeout(() => {
        const now = new Date().toLocaleString();
        setQuestionRunStates(prev => ({
          ...prev,
          [ref.id]: {
            isRunning: false,
            hasBeenRun: true,
            lastRunAt: now
          }
        }));
      }, delay);
    }

    // Set overall running state to false after the longest possible delay
    setTimeout(() => {
      setIsRunningReport(false);
    }, 3500);
  }, [handleSave, questionRefs, questionRunStates]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleQuestionClick = useCallback(
    (questionId: number) => {
      if (!editorInstance) {
        return;
      }

      // Find the question embed node in the document
      const { doc } = editorInstance.state;
      let targetPos = null;

      doc.descendants((node: any, pos: number) => {
        if (
          node.type.name === "questionEmbed" &&
          node.attrs.questionId === questionId
        ) {
          targetPos = pos;
          return false;
        }
      });

      if (targetPos !== null) {
        // Scroll to the node and highlight it
        editorInstance
          .chain()
          .focus()
          .setTextSelection(targetPos)
          .scrollIntoView()
          .run();

        // Add highlight effect
        const domNode = editorInstance.view.nodeDOM(targetPos);
        if (domNode) {
          domNode.classList.add(styles.highlighted);
          setTimeout(() => {
            domNode.classList.remove(styles.highlighted);
          }, 2000);
        }
      }
    },
    [editorInstance],
  );

  const handleDownloadMarkdown = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    (async () => {
      try {
        setIsDownloading(true);
        const rawMarkdown = editorInstance.storage.markdown?.getMarkdown();
        const processedMarkdown = await getDownloadableMarkdown(
          rawMarkdown,
          questionRefs,
        );

        downloadFile(processedMarkdown);
      } catch (error) {
        console.error("Failed to download markdown:", error);
      } finally {
        setIsDownloading(false);
      }
    })();
  }, [questionRefs, editorInstance]);

  return (
    <Box className={styles.reportPage}>
      <Box className={styles.contentArea}>
        <Box className={styles.mainContent}>
          <Flex p="sm">
            <ActionIcon
              variant="subtle"
              size="md"
              ml="auto"
              onClick={toggleSidebar}
              aria-label={isSidebarOpen ? t`Hide sidebar` : t`Show sidebar`}
            >
              <Icon name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"} />
            </ActionIcon>
          </Flex>
          <Box className={styles.documentContainer}>
            <Box className={styles.header} mt="xl" pt="xl">
              <input
                value={reportTitle}
                onChange={(event) => setReportTitle(event.currentTarget.value)}
                placeholder={t`New report`}
                className={styles.titleInput}
              />
              <Box
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                                 <Tooltip label={t`This will generate new snapshots of the queries in this report and create a new version`} openDelay={1000}>
                  <Button
                    variant="filled"
                    onClick={handleSaveAndRun}
                    size="md"
                    loading={isRunningReport}
                    disabled={isRunningReport || questionRefs.length === 0}
                  >
                   {isRunningReport ? t`Running...` : t`Run report`}
                </Button>
                 </Tooltip>

                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      size="md"
                      aria-label={t`More options`}
                    >
                      <Icon name="ellipsis" />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={
                        isDownloading ? (
                          <Loader size="xs" />
                        ) : (
                          <Icon name="download" />
                        )
                      }
                      onClick={handleDownloadMarkdown}
                      disabled={isDownloading}
                    >
                      {isDownloading ? t`Downloading...` : t`Download`}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Box>
            </Box>
            <Editor
              onEditorReady={setEditorInstance}
              onQuestionRefsChange={setQuestionRefs}
              questionRunStates={questionRunStates}
            />
          </Box>
        </Box>

        {isSidebarOpen && (
          <Box className={styles.sidebar}>
            <Stack gap="lg" p="lg">
              <Paper>
                <Text size="sm" fw="bold" mb="sm">
                  {t`Question References`}
                </Text>
                {questionRefs.length === 0 ? (
                  <Text size="sm" color="text-light">
                    {t`No questions embedded yet`}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {questionRefs.map((ref) => {
                      const runState = questionRunStates[ref.id];
                      const hasNotBeenRun = !runState?.hasBeenRun;
                      const isRunning = runState?.isRunning;
                      const lastRunAt = runState?.lastRunAt;



                      // Determine indicator state
                      let indicatorColor = "gray";
                      let tooltipLabel = t`Not yet run`;
                      let isProcessing = false;

                      if (isRunning) {
                        indicatorColor = "blue";
                        tooltipLabel = t`Running...`;
                        isProcessing = true;
                      } else if (hasNotBeenRun) {
                        indicatorColor = "gray";
                        tooltipLabel = t`Not yet run`;
                      } else if (lastRunAt) {
                        indicatorColor = "green";
                        tooltipLabel = t`Completed at ${lastRunAt}`;
                      }

                      return (
                        <Box
                          key={ref.id}
                          className={styles.questionRef}
                          onClick={() => handleQuestionClick(ref.id)}
                          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
                          <Tooltip label={tooltipLabel}>
                            <Box
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor:
                                  indicatorColor === "blue" ? "var(--mb-color-brand)" :
                                  indicatorColor === "green" ? "var(--mb-color-success)" :
                                  "var(--mb-color-text-light)",
                                animation: isProcessing ? "pulse 1.5s infinite" : undefined
                              }}
                            />
                          </Tooltip>
                          <Text size="sm" style={{ flex: 1 }}>{ref.name}</Text>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
};
