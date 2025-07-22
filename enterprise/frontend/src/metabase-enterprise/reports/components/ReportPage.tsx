import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
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
import {
  useCreateReportMutation,
  useGetReportQuery,
  useUpdateReportMutation,
} from "metabase-enterprise/api";

import {
  fetchReportQuestionData,
  selectQuestion,
  toggleSidebar,
} from "../reports.slice";
import { getIsSidebarOpen, getSelectedQuestionId } from "../selectors";

import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";
import styles from "./ReportPage.module.css";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const ReportPage = ({
  params: { id: reportId },
}: {
  params: { id?: number | "new" };
}) => {
  const dispatch = useDispatch();
  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const isSidebarOpen = useSelector(getIsSidebarOpen);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [createReport] = useCreateReportMutation();
  const [updateReport] = useUpdateReportMutation();
  const { data: report, isLoading: isReportLoading } = useGetReportQuery(
    reportId && reportId !== "new" ? reportId : skipToken,
  );

  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");

  // Centralized data loading for question embeds
  const questionIds = useMemo(
    () =>
      questionRefs
        .map((ref) => ref.id)
        .sort()
        .join(","),
    [questionRefs],
  );

  useEffect(() => {
    if (questionIds) {
      const ids = questionIds.split(",").map((id) => parseInt(id));
      ids.forEach((id) => {
        dispatch(fetchReportQuestionData(id));
      });
    }
  }, [questionIds, dispatch]);

  useEffect(() => {
    if (report) {
      setReportTitle(report.name);
      setReportContent(report.document);
    }
  }, [report]);

  const handleSave = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    const markdown = editorInstance.storage.markdown?.getMarkdown() ?? "";
    const newReportData = {
      name: reportTitle,
      document: markdown as string,
    };

    report?.id
      ? updateReport({ ...newReportData, id: report.id }).unwrap()
      : createReport(newReportData).unwrap();
  }, [editorInstance, createReport, updateReport, report, reportTitle]);

  const handleToggleSidebar = useCallback(() => {
    dispatch(toggleSidebar());
  }, [dispatch]);

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
              onClick={handleToggleSidebar}
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
                <Button variant="filled" onClick={handleSave} size="md">
                  {t`Save`}
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
            {isReportLoading ? (
              <Loader />
            ) : (
              <Editor
                onEditorReady={setEditorInstance}
                onQuestionRefsChange={setQuestionRefs}
                onQuestionSelect={(id) => dispatch(selectQuestion(id))}
                content={reportContent}
              />
            )}
          </Box>
        </Box>

        {isSidebarOpen && (
          <Box className={styles.sidebar}>
            {selectedQuestionId ? (
              <EmbedQuestionSettingsSidebar
                questionId={selectedQuestionId}
                onClose={() => dispatch(selectQuestion(null))}
              />
            ) : (
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
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
