import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import type { Route } from "react-router";
import { push, replace } from "react-router-redux";
import { usePrevious } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { ActionIcon, Box, Button, Icon, Loader, Menu } from "metabase/ui";
import {
  useCreateReportMutation,
  useGetReportQuery,
  useUpdateReportMutation,
} from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";

import {
  useRegisterReportMetabotContext,
  useReportActions,
  useReportState,
} from "../hooks";
import { useReportsSelector } from "../redux-utils";
import { closeSidebar, resetReports } from "../reports.slice";
import { getSelectedEmbedIndex, getSelectedQuestionId } from "../selectors";

import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";
import styles from "./ReportPage.module.css";
import { VersionSelect } from "./VersionSelect";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const ReportPage = ({
  params: { id: reportId },
  location,
  route,
}: {
  params: { id?: number | "new" };
  location?: { query?: { version?: string } };
  route: Route;
}) => {
  const dispatch = useDispatch();
  const selectedQuestionId = useReportsSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useReportsSelector(getSelectedEmbedIndex);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [createReport] = useCreateReportMutation();
  const [updateReport] = useUpdateReportMutation();
  const [
    isShowingCollectionPicker,
    { open: showCollectionPicker, close: hideCollectionPicker },
  ] = useDisclosure(false);
  const [sendToast] = useToast();
  const selectedVersion = location?.query?.version
    ? Number(location.query.version)
    : undefined;
  const previousReportId = usePrevious(reportId);
  const previousVersion = usePrevious(selectedVersion);

  const { data: report, isLoading: isReportLoading } = useGetReportQuery(
    reportId && reportId !== "new"
      ? { id: reportId, version: selectedVersion }
      : skipToken,
  );

  const { data: collection } = useGetCollectionQuery(
    report?.collection_id ? { id: report.collection_id } : skipToken,
  );

  const canWrite = reportId === "new" ? true : collection?.can_write;

  const {
    reportTitle,
    setReportTitle,
    reportContent,
    setReportContent,
    cardEmbeds,
    updateCardEmbeds,
  } = useReportState(report);

  // Reset current content when report changes
  useEffect(() => {
    if (reportId !== previousReportId || selectedVersion !== previousVersion) {
      setCurrentContent(reportContent || "");
    }
  }, [
    reportId,
    previousReportId,
    selectedVersion,
    previousVersion,
    reportContent,
  ]);

  const {
    commitVisualizationChanges,
    commitAllPendingChanges,
    refreshAllData,
  } = useReportActions();
  useRegisterReportMetabotContext();
  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Update current content when report content changes
  useEffect(() => {
    setCurrentContent(reportContent || "");
  }, [reportContent]);

  // Reset state when creating a new report
  useEffect(() => {
    if (reportId === "new" && previousReportId !== "new") {
      setReportTitle("");
      setReportContent("");
      setCurrentContent("");
      // Clear the Redux state to ensure no card embeds from previous report
      dispatch(resetReports());
    }
  }, [reportId, setReportTitle, setReportContent, previousReportId, dispatch]);

  const hasUnsavedChanges = useCallback(() => {
    const currentTitle = reportTitle.trim();
    const originalTitle = report?.name || "";
    const titleChanged = currentTitle !== originalTitle;

    // For new reports, show Save if there's title or content exists
    if (reportId === "new") {
      const emptyDocAst = JSON.stringify({ type: "doc", content: [] });
      const hasContent =
        currentContent !== emptyDocAst && currentContent !== "";
      return currentTitle.length > 0 || hasContent;
    }

    // For existing reports, compare current content with report content
    const contentChanged = currentContent !== (reportContent ?? "");

    return titleChanged || contentChanged;
  }, [reportTitle, reportId, report, currentContent, reportContent]);

  const showSaveButton = hasUnsavedChanges() && canWrite;

  const handleSave = useCallback(
    async (collectionId?: CollectionId) => {
      if (!editorInstance) {
        return;
      }

      try {
        // Commit all pending visualization changes before saving
        await commitAllPendingChanges(editorInstance);

        // Use the current content (already in JSON AST format)
        const newReportData = {
          name: reportTitle,
          document: currentContent,
        };

        const result = await (reportId !== "new" && report?.id
          ? updateReport({ ...newReportData, id: report.id }).then(
              (response) => {
                if (response.data) {
                  dispatch(
                    push(
                      `/report/${response.data.id}?version=${response.data.version}`,
                    ),
                  );
                }
                return response.data;
              },
            )
          : createReport({
              ...newReportData,
              collection_id: collectionId,
            }).then((response) => {
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
          // Content will be updated automatically when the new report data loads
        }
      } catch (error) {
        console.error("Failed to save report:", error);
        sendToast({ message: t`Error saving report`, icon: "warning" });
      }
    },
    [
      editorInstance,
      createReport,
      updateReport,
      report,
      reportTitle,
      currentContent,
      sendToast,
      dispatch,
      commitAllPendingChanges,
      reportId,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut: Cmd+S (Mac) or Ctrl+S (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (!hasUnsavedChanges()) {
          return;
        }

        reportId === "new" ? showCollectionPicker() : handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasUnsavedChanges, handleSave, reportId, showCollectionPicker]);

  const handleQuestionSelect = useCallback(async () => {
    if (selectedEmbedIndex !== null) {
      await commitVisualizationChanges(selectedEmbedIndex, editorInstance);
    }
  }, [selectedEmbedIndex, commitVisualizationChanges, editorInstance]);

  const handleRefreshAllData = useCallback(async () => {
    await refreshAllData(editorInstance);
  }, [refreshAllData, editorInstance]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    (async () => {
      try {
        setIsDownloading(true);
        const rawMarkdown = editorInstance.storage.markdown.getMarkdown();
        const processedMarkdown = await getDownloadableMarkdown(
          rawMarkdown,
          cardEmbeds,
        );

        downloadFile(processedMarkdown);
      } catch (error) {
        console.error("Failed to download markdown:", error);
      } finally {
        setIsDownloading(false);
      }
    })();
  }, [cardEmbeds, editorInstance]);

  return (
    <Box className={styles.reportPage}>
      <Box className={styles.contentArea}>
        <Box className={styles.mainContent}>
          <Box className={styles.documentContainer}>
            <Box className={styles.header} mt="xl" pt="xl">
              <Box>
                <input
                  value={reportTitle}
                  onChange={(event) =>
                    setReportTitle(event.currentTarget.value)
                  }
                  placeholder={t`New report`}
                  readOnly={!canWrite}
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
                {showSaveButton && (
                  <Button
                    onClick={() => {
                      reportId === "new"
                        ? showCollectionPicker()
                        : handleSave();
                    }}
                    variant="filled"
                  >
                    {t`Save`}
                  </Button>
                )}
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
                      onClick={handleRefreshAllData}
                      disabled={!canWrite}
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
                onCardEmbedsChange={updateCardEmbeds}
                onQuestionSelect={handleQuestionSelect}
                content={reportContent || ""}
                onChange={setCurrentContent}
                editable={canWrite}
              />
            )}
          </Box>
        </Box>

        {selectedQuestionId && selectedEmbedIndex !== null && (
          <Box className={styles.sidebar}>
            <EmbedQuestionSettingsSidebar
              cardId={selectedQuestionId}
              snapshotId={cardEmbeds[selectedEmbedIndex]?.snapshotId || 0}
              onClose={() => dispatch(closeSidebar())}
              editorInstance={editorInstance}
            />
          </Box>
        )}

        {isShowingCollectionPicker && (
          <CollectionPickerModal
            title={t`Where should we save this report?`}
            onClose={hideCollectionPicker}
            value={{ id: "root", model: "collection" }}
            options={{
              showPersonalCollections: true,
              showRootCollection: true,
            }}
            onChange={(collection) => {
              handleSave(collection.id as CollectionId);
              hideCollectionPicker();
            }}
          />
        )}
        <LeaveRouteConfirmModal isEnabled={hasUnsavedChanges()} route={route} />
      </Box>
    </Box>
  );
};
