import { useCallback, useState } from "react";
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
} from "metabase/ui";

import { Editor } from "./Editor";
import styles from "./ReportPage.module.css";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const ReportPage = () => {
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const handleSaveAndRun = useCallback(() => {
    handleSave();
    // TODO: Add run logic here
  }, [handleSave]);

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
                <Button variant="filled" onClick={handleSaveAndRun} size="md">
                  {t`Save and Run`}
                </Button>

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
                    {questionRefs.map((ref) => (
                      <Box
                        key={ref.id}
                        className={styles.questionRef}
                        onClick={() => handleQuestionClick(ref.id)}
                      >
                        <Text size="sm">{ref.name}</Text>
                      </Box>
                    ))}
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
