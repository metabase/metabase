import { useDisclosure } from "@mantine/hooks";
import type { Editor as TiptapEditor } from "@tiptap/core";
import cx from "classnames";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type { Route } from "react-router";
import { push, replace } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import DateTime, {
  getFormattedTime,
} from "metabase/common/components/DateTime";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import { extractEntityId } from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Menu,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import {
  useCreateDocumentMutation,
  useGetDocumentQuery,
  useUpdateDocumentMutation,
} from "metabase-enterprise/api";
import type { Card, RegularCollectionId } from "metabase-types/api";

import {
  clearDraftCards,
  closeSidebar,
  openVizSettingsSidebar,
  resetDocuments,
  setCurrentDocument,
} from "../documents.slice";
import { useDocumentState, useRegisterDocumentMetabotContext } from "../hooks";
import { useDocumentsSelector } from "../redux-utils";
import {
  getDraftCards,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "../selectors";

import styles from "./DocumentPage.module.css";
import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";

export const DocumentPage = ({
  params: { entityId },
  route,
}: {
  params: { entityId?: string };
  location?: { query?: { version?: string } };
  route: Route;
}) => {
  const dispatch = useDispatch();
  const selectedQuestionId = useDocumentsSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useDocumentsSelector(getSelectedEmbedIndex);
  const draftCards = useDocumentsSelector(getDraftCards);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(
    null,
  );
  const [hasUnsavedEditorChanges, setHasUnsavedEditorChanges] = useState(false);
  const [createDocument, { isLoading: isCreating }] =
    useCreateDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] =
    useUpdateDocumentMutation();
  const [
    isShowingCollectionPicker,
    { open: showCollectionPicker, close: hideCollectionPicker },
  ] = useDisclosure(false);
  const [sendToast] = useToast();

  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);
  const previousDocumentId = usePrevious(documentId);
  const [isNavigationScheduled, scheduleNavigation] = useCallbackEffect();
  const isNewDocument = documentId === "new";

  let {
    data: documentData,
    isLoading: isDocumentLoading,
    error,
  } = useGetDocumentQuery(
    documentId && !isNewDocument ? { id: documentId } : skipToken,
  );
  if (documentId !== documentData?.id) {
    documentData = undefined;
  }

  const canWrite = isNewDocument ? true : documentData?.can_write;

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

  const {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
  } = useDocumentState(documentData);

  // This is important as it will affect collection breadcrumbs in the appbar
  useUnmount(() => {
    dispatch(resetDocuments());
  });

  useRegisterDocumentMetabotContext();
  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Reset state when document changes
  useEffect(() => {
    if (documentId !== previousDocumentId) {
      setHasUnsavedEditorChanges(false);
      if (isNewDocument && previousDocumentId !== "new") {
        setDocumentTitle("");
        setDocumentContent(null);
        dispatch(resetDocuments());
      }
    }
  }, [
    documentId,
    previousDocumentId,
    isNewDocument,
    setDocumentTitle,
    setDocumentContent,
    dispatch,
  ]);

  // Reset dirty state when document content loads from API
  useEffect(() => {
    if (documentContent && !isNewDocument) {
      setHasUnsavedEditorChanges(false);
    }
  }, [documentContent, isNewDocument]);

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

    // Check if there are any draft cards
    const hasDraftCards = Object.keys(draftCards).length > 0;

    // For new documents, show Save if there's title or editor changes or draft cards
    if (isNewDocument) {
      return (
        currentTitle.length > 0 || hasUnsavedEditorChanges || hasDraftCards
      );
    }

    // For existing documents, use simple change tracking
    return titleChanged || hasUnsavedEditorChanges || hasDraftCards;
  }, [
    documentTitle,
    isNewDocument,
    documentData,
    hasUnsavedEditorChanges,
    draftCards,
  ]);

  const isSaving = isCreating || isUpdating;
  const showSaveButton = hasUnsavedChanges() && canWrite && !isSaving;

  const handleContentChanged = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    // Compare current content with original content
    const currentContent = editorInstance.getJSON();
    const originalContent = documentContent;

    // For new documents, any content means changes
    if (isNewDocument) {
      setHasUnsavedEditorChanges(!editorInstance.isEmpty);
      return;
    }

    // For existing documents, compare with original content
    const hasChanges = !_.isEqual(currentContent, originalContent);
    setHasUnsavedEditorChanges(hasChanges);
  }, [editorInstance, documentContent, isNewDocument]);

  const handleSave = useCallback(
    async (collectionId: RegularCollectionId | null = null) => {
      if (!editorInstance || isSaving) {
        return;
      }

      try {
        const cardsToSave: Record<number, Card> = {};
        const processedCardIds = new Set<number>();

        editorInstance.state.doc.descendants((node: any) => {
          if (node.type.name === "cardEmbed") {
            const cardId = node.attrs.id;
            if (!processedCardIds.has(cardId)) {
              processedCardIds.add(cardId);

              if (cardId < 0 && draftCards[cardId]) {
                cardsToSave[cardId] = draftCards[cardId];
              }
            }
          }
        });

        const documentAst = editorInstance ? editorInstance.getJSON() : null;
        const name =
          documentTitle ||
          t`Untitled document - ${dayjs().local().format("MMMM D, YYYY")}`;

        const newDocumentData: any = {
          name,
          document: documentAst,
          cards: Object.keys(cardsToSave).length > 0 ? cardsToSave : undefined,
        };

        const result = await (documentData?.id
          ? updateDocument({ ...newDocumentData, id: documentData.id }).then(
              (response) => {
                if (response.data) {
                  scheduleNavigation(() => {
                    dispatch(push(`/document/${response.data.id}`));
                  });
                }
                return response.data;
              },
            )
          : createDocument({
              ...newDocumentData,
              collection_id: collectionId || undefined,
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
            message: documentData?.id ? t`Document saved` : t`Document created`,
          });
          dispatch(clearDraftCards());
          // Mark document as clean
          setHasUnsavedEditorChanges(false);
        }
      } catch (error) {
        console.error("Failed to save document:", error);
        sendToast({ message: t`Error saving document`, icon: "warning" });
      }
    },
    [
      editorInstance,
      isSaving,
      documentTitle,
      draftCards,
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
        if (!hasUnsavedChanges() || !canWrite) {
          return;
        }

        isNewDocument ? showCollectionPicker() : handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    hasUnsavedChanges,
    handleSave,
    isNewDocument,
    showCollectionPicker,
    canWrite,
  ]);

  const handleQuestionSelect = useCallback(
    (cardId: number | null, embedIndex?: number | null) => {
      if (
        cardId !== null &&
        embedIndex !== null &&
        embedIndex !== undefined &&
        embedIndex >= 0 &&
        selectedEmbedIndex !== null
      ) {
        // Only update the selected embed index if the sidebar is already open
        dispatch(openVizSettingsSidebar({ embedIndex }));
      }
    },
    [dispatch, selectedEmbedIndex],
  );

  const handlePrintDocument = useCallback(() => {
    window.print();
  }, []);

  return (
    <Box className={styles.documentPage}>
      <Box className={styles.contentArea}>
        <Box className={styles.mainContent}>
          <Box className={styles.documentContainer}>
            <Box className={styles.header} mt="xl" pt="xl">
              <Flex direction="column" w="100%">
                <TextInput
                  aria-label={t`Document Title`}
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
                      {documentData.creator.common_name}{" "}
                    </Text>
                    <Tooltip
                      label={getFormattedTime(
                        documentData.updated_at,
                        "default",
                        { local: true },
                      )}
                    >
                      <Text className={styles.metadataItem}>
                        <Icon name="clock" />
                        <DateTime value={documentData.updated_at} unit="day" />
                      </Text>
                    </Tooltip>
                  </Flex>
                )}
              </Flex>
              <Flex gap="md" align="center">
                <Box
                  className={cx(styles.hidable, {
                    [styles.visible]: showSaveButton,
                  })}
                >
                  <Button
                    onClick={() => {
                      isNewDocument ? showCollectionPicker() : handleSave();
                    }}
                    variant="filled"
                    data-hide-on-print
                  >
                    {t`Save`}
                  </Button>
                </Box>
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
              initialContent={documentContent}
              onContentChanged={handleContentChanged}
              editable={canWrite}
              isLoading={isDocumentLoading}
            />
          </Box>
        </Box>

        {selectedQuestionId &&
          selectedEmbedIndex !== null &&
          editorInstance && (
            <Box className={styles.sidebar} data-testid="document-card-sidebar">
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
          // `key` remounts this modal when navigating between different documents or to a new document.
          // The `route` doesn't change in that scenario which prevents the modal from closing when you confirm you want to discard your changes.
          key={documentId}
          isEnabled={hasUnsavedChanges() && !isNavigationScheduled}
          route={route}
        />
      </Box>
    </Box>
  );
};
