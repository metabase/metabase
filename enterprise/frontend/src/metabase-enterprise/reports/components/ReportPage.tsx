import { useCallback, useEffect, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  Text,
} from "metabase/ui";
import {
  useCreateReportMutation,
  useCreateReportSnapshotMutation,
  useGetReportQuery,
  useGetReportVersionsQuery,
  useUpdateReportMutation,
} from "metabase-enterprise/api";

import {
  clearModifiedVisualizationSettings,
  fetchReportQuestionData,
  selectQuestion,
  toggleSidebar,
} from "../reports.slice";
import {
  getHasModifiedVisualizationSettings,
  getIsSidebarOpen,
  getReportCard,
  getSelectedQuestionId,
} from "../selectors";

import { Editor, type QuestionRef } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";
import styles from "./ReportPage.module.css";
import { UsedContentSidebar } from "./UsedContent";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const ReportPage = ({
  params: { id: reportId },
  location,
}: {
  params: { id?: number | "new" };
  location?: { query?: { version?: string } };
}) => {
  const dispatch = useDispatch();
  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const isSidebarOpen = useSelector(getIsSidebarOpen);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<QuestionRef[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [createReport] = useCreateReportMutation();
  const [updateReport] = useUpdateReportMutation();
  const [createReportSnapshot] = useCreateReportSnapshotMutation();
  const [sendToast] = useToast();

  const selectedVersion = location?.query?.version
    ? Number(location.query.version)
    : undefined;
  const { data: report, isLoading: isReportLoading } = useGetReportQuery(
    reportId && reportId !== "new"
      ? { id: reportId, version: selectedVersion }
      : skipToken,
  );

  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const store = useStore();

  useEffect(() => {
    questionRefs.forEach((ref) => {
      if (ref.snapshotId) {
        dispatch(
          fetchReportQuestionData({
            cardId: ref.id,
            snapshotId: ref.snapshotId,
          }),
        );
      }
    });
  }, [questionRefs, dispatch]);

  useEffect(() => {
    if (report) {
      setReportTitle(report.name);
      setReportContent(report.document);
    }
  }, [report]);

  const commitVisualizationChanges = useCallback(
    async (cardId: number) => {
      const state = store.getState();
      const card = getReportCard(state, cardId);
      const hasModified = getHasModifiedVisualizationSettings(state, cardId);

      if (!card || !hasModified || !editorInstance) {
        return;
      }

      try {
        const { id, created_at, updated_at, ...cardWithoutExcluded } = card;
        const result = await createReportSnapshot({
          ...cardWithoutExcluded,
          name: card.name,
        }).unwrap();

        dispatch(clearModifiedVisualizationSettings(cardId));
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        doc.descendants((node: any, pos: number) => {
          if (
            node.type.name === "questionEmbed" &&
            node.attrs.questionId === cardId
          ) {
            const newAttrs = {
              ...node.attrs,
              questionId: result.card_id,
              snapshotId: result.snapshot_id,
            };
            tr.setNodeMarkup(pos, undefined, newAttrs);
            return false;
          }
        });

        if (tr.docChanged) {
          editorInstance.view.dispatch(tr);
        }

        setQuestionRefs((prev) =>
          prev.map((ref) =>
            ref.id === cardId
              ? { ...ref, id: result.card_id, snapshotId: result.snapshot_id }
              : ref,
          ),
        );
      } catch (error) {
        console.error("Failed to commit visualization changes:", error);
      }
    },
    [store, editorInstance, createReportSnapshot, dispatch],
  );

  const handleSave = useCallback(async () => {
    if (!editorInstance) {
      return;
    }

    try {
      const state = store.getState();
      const modifiedCards = Object.keys(
        (state as any).plugins?.reports?.modifiedVisualizationSettings || {},
      )
        .map(Number)
        .filter((cardId) => getHasModifiedVisualizationSettings(state, cardId));

      if (modifiedCards.length > 0) {
        await Promise.all(
          modifiedCards.map((cardId) => commitVisualizationChanges(cardId)),
        );
      }

      const markdown = editorInstance.storage.markdown?.getMarkdown() ?? "";
      const newReportData = {
        name: reportTitle,
        document: markdown as string,
      };

      const result = await (report?.id
        ? updateReport({ ...newReportData, id: report.id }).then((response) => {
            if (response.data) {
              dispatch(
                push(
                  `/report/${response.data.id}?version=${response.data.version}`,
                ),
              );
            }
            return response.data;
          })
        : createReport(newReportData).then((response) => {
            if (response.data) {
              dispatch(replace(`/report/${response.data.id}`));
            }
            return response.data;
          }));

      if (result) {
        sendToast({
          message: report?.id
            ? t`Report v${result?.version} saved`
            : t`Report created`,
        });
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      sendToast({ message: t`Error saving report`, icon: "warning" });
    }
  }, [
    editorInstance,
    createReport,
    updateReport,
    report,
    reportTitle,
    sendToast,
    dispatch,
    store,
    commitVisualizationChanges,
  ]);

  const handleToggleSidebar = useCallback(async () => {
    // If we're closing the sidebar with a selected question, commit any pending changes
    if (isSidebarOpen && selectedQuestionId) {
      await commitVisualizationChanges(selectedQuestionId);

      // When closing sidebar with a selected question, clear editor selection first
      if (editorInstance) {
        editorInstance.commands.focus("end");
      }
      dispatch(selectQuestion(null));
    }
    dispatch(toggleSidebar());
  }, [
    dispatch,
    isSidebarOpen,
    selectedQuestionId,
    editorInstance,
    commitVisualizationChanges,
  ]);

  const handleQuestionSelect = useCallback(
    async (newQuestionId: number | null) => {
      if (selectedQuestionId && selectedQuestionId !== newQuestionId) {
        await commitVisualizationChanges(selectedQuestionId);
      }
      dispatch(selectQuestion(newQuestionId));
    },
    [selectedQuestionId, commitVisualizationChanges, dispatch],
  );

  const handleQuestionClick = useCallback(
    (questionId: number) => {
      if (!editorInstance) {
        return;
      }

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
        editorInstance
          .chain()
          .focus()
          .setTextSelection(targetPos)
          .scrollIntoView()
          .run();
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
          <Box
            style={{
              position: "sticky",
              top: 0,
              zIndex: 100,
              display: "flex",
              justifyContent: "flex-end",
              padding: "0.5rem",
              pointerEvents: "none",
            }}
          >
            <ActionIcon
              variant="subtle"
              size="md"
              onClick={handleToggleSidebar}
              aria-label={isSidebarOpen ? t`Hide sidebar` : t`Show sidebar`}
              style={{
                pointerEvents: "auto",
              }}
            >
              <Icon
                name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"}
                size={20}
              />
            </ActionIcon>
          </Box>
          <Box className={styles.documentContainer}>
            <Box className={styles.header} mt="xl" pt="xl">
              <Box>
                <input
                  value={reportTitle}
                  onChange={(event) =>
                    setReportTitle(event.currentTarget.value)
                  }
                  placeholder={t`New report`}
                  className={styles.titleInput}
                />
                <VersionSelect
                  reportId={reportId}
                  currentVersion={report?.version}
                />
              </Box>
              <Box
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <Button onClick={handleSave} variant="filled">
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
                    <Menu.Item
                      leftSection={<Icon name="refresh" />}
                      onClick={() => {
                        /* TODO */
                      }}
                    >
                      {t`Refresh all data`}
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
                onQuestionSelect={handleQuestionSelect}
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
                snapshotId={
                  questionRefs.find((ref) => ref.id === selectedQuestionId)
                    ?.snapshotId || 0
                }
                onClose={() => dispatch(selectQuestion(null))}
              />
            ) : (
              <UsedContentSidebar
                questionRefs={questionRefs}
                onQuestionClick={handleQuestionClick}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

function VersionSelect({
  reportId,
  currentVersion,
}: {
  reportId?: number | "new";
  currentVersion?: number;
}) {
  const dispatch = useDispatch();

  const { data: versions, isLoading } = useGetReportVersionsQuery(
    reportId && reportId !== "new" ? { id: reportId } : skipToken,
  );

  const handleVersionSelect = useCallback(
    (version: number) => {
      if (reportId && reportId !== "new") {
        dispatch(replace(`/report/${reportId}?version=${version}`));
      }
    },
    [reportId, dispatch],
  );

  if (!currentVersion) {
    return null;
  }

  if (isLoading) {
    return (
      <Flex>
        <Loader size="xs" />
      </Flex>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Flex>
        <Text c="text-light" fw="bold">
          {currentVersion ? `v${currentVersion}` : null}
        </Text>
      </Flex>
    );
  }

  return (
    <Flex>
      <Menu position="right-start">
        <Menu.Target>
          <Text c="text-light" fw="bold" style={{ cursor: "pointer" }}>
            {currentVersion ? `v${currentVersion}` : null}
            <Icon name="chevrondown" ml="sm" size="10px" mt="xs" />
          </Text>
        </Menu.Target>
        <Menu.Dropdown>
          {versions.map((version) => (
            <Menu.Item
              key={version.version}
              onClick={() => handleVersionSelect(version.version)}
              rightSection={
                version.version === currentVersion ? (
                  <Icon name="check_filled" c="text-medium" />
                ) : null
              }
            >
              {`v${version.version} `}
              <Text size="sm" c="text-light">
                {formatDateTimeWithUnit(version.created_at, "hour")}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
}
