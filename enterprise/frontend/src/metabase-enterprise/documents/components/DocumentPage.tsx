import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import type { Route } from "react-router";
import { push, replace } from "react-router-redux";
import { usePrevious } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import DateTime from "metabase/common/components/DateTime";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useCreateDocumentMutation,
  useGetDocumentQuery,
  useUpdateDocumentMutation,
} from "metabase-enterprise/api";
import type { RegularCollectionId } from "metabase-types/api";

import {
  closeSidebar,
  resetDocuments,
  setCurrentDocument,
} from "../documents.slice";
import {
  useDocumentActions,
  useDocumentState,
  useRegisterDocumentMetabotContext,
} from "../hooks";
import { useDocumentsSelector } from "../redux-utils";
import { getSelectedEmbedIndex, getSelectedQuestionId } from "../selectors";

import styles from "./DocumentPage.module.css";
import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";
import { downloadFile, getDownloadableMarkdown } from "./exports";

export const DocumentPage = ({
  params: { id: documentId },
  location,
  route,
}: {
  params: { id?: number | "new" };
  location?: { query?: { version?: string } };
  route: Route;
}) => {
  const dispatch = useDispatch();
  const selectedQuestionId = useDocumentsSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useDocumentsSelector(getSelectedEmbedIndex);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [createDocument] = useCreateDocumentMutation();
  const [updateDocument] = useUpdateDocumentMutation();
  const [
    isShowingCollectionPicker,
    { open: showCollectionPicker, close: hideCollectionPicker },
  ] = useDisclosure(false);
  const [sendToast] = useToast();
  const selectedVersion = location?.query?.version
    ? Number(location.query.version)
    : undefined;
  const previousDocumentId = usePrevious(documentId);
  const previousVersion = usePrevious(selectedVersion);
  const [isNavigationScheduled, scheduleNavigation] = useCallbackEffect();
  const isNewDocument = documentId === "new";

  const { data: documentData, isLoading: isDocumentLoading } =
    useGetDocumentQuery(
      documentId && !isNewDocument
        ? { id: documentId, version: selectedVersion }
        : skipToken,
    );

  const { data: collection } = useGetCollectionQuery(
    documentData?.collection_id
      ? { id: documentData.collection_id }
      : skipToken,
  );

  const { data: selectedCard } = useGetCardQuery(
    selectedQuestionId ? { id: selectedQuestionId } : skipToken,
  );

  const canWrite = isNewDocument ? true : collection?.can_write;

  const {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    cardEmbeds,
    updateCardEmbeds,
  } = useDocumentState(documentData);

  // Reset current content when document changes
  useEffect(() => {
    if (
      documentId !== previousDocumentId ||
      selectedVersion !== previousVersion
    ) {
      setCurrentContent(documentContent || "");
    }
  }, [
    documentId,
    previousDocumentId,
    selectedVersion,
    previousVersion,
    documentContent,
  ]);

  const { commitVisualizationChanges, commitAllPendingChanges } =
    useDocumentActions();
  useRegisterDocumentMetabotContext();
  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Update current content when document content changes
  useEffect(() => {
    setCurrentContent(documentContent || "");
  }, [documentContent]);

  // Reset state when creating a new document
  useEffect(() => {
    if (isNewDocument && previousDocumentId !== "new") {
      setDocumentTitle("");
      setDocumentContent("");
      setCurrentContent("");
      // Clear the Redux state to ensure no card embeds from previous document
      dispatch(resetDocuments());
    }
  }, [
    documentId,
    setDocumentTitle,
    setDocumentContent,
    previousDocumentId,
    dispatch,
    isNewDocument,
  ]);

  useEffect(() => {
    // Set current document when document loads (includes collection_id and all other data)
    if (documentData && !isNewDocument) {
      dispatch(setCurrentDocument(documentData));
    } else if (isNewDocument) {
      dispatch(setCurrentDocument(null));
    }
  }, [documentData, documentId, dispatch, isNewDocument]);

  const hasUnsavedChanges = useCallback(() => {
    const currentTitle = documentTitle.trim();
    const originalTitle = documentData?.name || "";
    const titleChanged = currentTitle !== originalTitle;

    // For new documents, show Save if there's title or content exists
    if (isNewDocument) {
      const emptyDocAst = JSON.stringify({ type: "doc", content: [] });
      const hasContent =
        currentContent !== emptyDocAst && currentContent !== "";
      return currentTitle.length > 0 || hasContent;
    }

    // For existing documents, compare current content with document content
    const contentChanged = currentContent !== (documentContent ?? "");

    return titleChanged || contentChanged;
  }, [
    documentTitle,
    isNewDocument,
    documentData,
    currentContent,
    documentContent,
  ]);

  const showSaveButton = hasUnsavedChanges() && canWrite;

  const handleSave = useCallback(
    async (collectionId: RegularCollectionId | null = null) => {
      if (!editorInstance) {
        return;
      }

      try {
        // Commit all pending visualization changes before saving
        await commitAllPendingChanges(editorInstance);

        // Use the current content (already in JSON AST format)
        const newDocumentData = {
          name: documentTitle,
          document: currentContent,
          card_ids: [...new Set(cardEmbeds.map((embed) => embed.id))],
        };

        const result = await (isNewDocument && documentData?.id
          ? updateDocument({ ...newDocumentData, id: documentData.id }).then(
              (response) => {
                if (response.data) {
                  scheduleNavigation(() => {
                    dispatch(
                      push(
                        `/document/${response.data.id}?version=${response.data.version}`,
                      ),
                    );
                  });
                }
                return response.data;
              },
            )
          : createDocument({
              ...newDocumentData,
              collection_id: collectionId,
            }).then((response) => {
              if (response.data) {
                scheduleNavigation(() => {
                  dispatch(replace(`/document/${response.data.id}`));
                });
              }
              return response.data;
            }));

        if (result) {
          sendToast({
            message: documentData?.id
              ? t`Document v${result?.version} saved`
              : t`Document created`,
          });
          // Content will be updated automatically when the new document data loads
        }
      } catch (error) {
        console.error("Failed to save document:", error);
        sendToast({ message: t`Error saving document`, icon: "warning" });
      }
    },
    [
      editorInstance,
      commitAllPendingChanges,
      documentTitle,
      currentContent,
      cardEmbeds,
      isNewDocument,
      documentData?.id,
      updateDocument,
      createDocument,
      scheduleNavigation,
      dispatch,
      sendToast,
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

        isNewDocument ? showCollectionPicker() : handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasUnsavedChanges, handleSave, isNewDocument, showCollectionPicker]);

  const handleQuestionSelect = useCallback(async () => {
    if (selectedEmbedIndex !== null && selectedCard) {
      await commitVisualizationChanges(
        selectedEmbedIndex,
        editorInstance,
        selectedCard,
      );
    }
  }, [
    selectedEmbedIndex,
    commitVisualizationChanges,
    editorInstance,
    selectedCard,
  ]);

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

  const handlePrintDocument = useCallback(() => {
    window.print();
  }, []);

  return (
    <Box className={styles.documentPage}>
      <Box className={styles.contentArea}>
        <Box className={styles.mainContent}>
          <Box className={styles.documentContainer}>
            <Box className={styles.header} mt="xl" pt="xl">
              {/* <Flex gap="sm" align="center" style={{ width: "100%" }}> */}
              <Flex direction="column">
                <TextInput
                  autoFocus={isNewDocument}
                  value={documentTitle}
                  onChange={(event) =>
                    setDocumentTitle(event.currentTarget.value)
                  }
                  flex={1}
                  placeholder={t`New document`}
                  readOnly={!canWrite}
                  styles={{
                    input: {
                      border: "none",
                      padding: 0,
                      fontSize: "2rem",
                      fontWeight: "bold",
                    },
                  }}
                />
                {documentData && (
                  <Flex gap="md">
                    <Text className={styles.metadataItem}>
                      <Icon name="person" />
                      {t`Someone`}{" "}
                    </Text>
                    <Text className={styles.metadataItem}>
                      <Icon name="clock" />
                      <DateTime value={documentData.updated_at} unit="day" />
                    </Text>
                  </Flex>
                )}
              </Flex>
              <Flex gap="md" align="center">
                {showSaveButton && (
                  <Button
                    onClick={() => {
                      isNewDocument ? showCollectionPicker() : handleSave();
                    }}
                    variant="filled"
                    data-hide-on-print
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
                      data-hide-on-print
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
                      leftSection={<Icon name="document" />}
                      onClick={handlePrintDocument}
                    >
                      {t`Print Document`}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Flex>
            </Box>
            <Editor
              onEditorReady={setEditorInstance}
              onCardEmbedsChange={updateCardEmbeds}
              onQuestionSelect={handleQuestionSelect}
              content={documentContent || ""}
              onChange={setCurrentContent}
              editable={canWrite}
              isLoading={isDocumentLoading}
            />
          </Box>
        </Box>

        {selectedQuestionId && selectedEmbedIndex !== null && (
          <Box className={styles.sidebar}>
            <EmbedQuestionSettingsSidebar
              cardId={selectedQuestionId}
              onClose={() => dispatch(closeSidebar())}
              editorInstance={editorInstance}
            />
          </Box>
        )}

        {isShowingCollectionPicker && (
          <CollectionPickerModal
            title={t`Where should we save this document?`}
            onClose={hideCollectionPicker}
            value={{ id: "root", model: "collection" }}
            options={{
              showPersonalCollections: true,
              showRootCollection: true,
            }}
            onChange={(collection) => {
              handleSave(canonicalCollectionId(collection.id));
              hideCollectionPicker();
            }}
          />
        )}
        <LeaveRouteConfirmModal
          isEnabled={hasUnsavedChanges() && !isNavigationScheduled}
          route={route}
        />
      </Box>
    </Box>
  );
};
