import { sql } from "@codemirror/lang-sql";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import EditableText from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { Box, Flex, Stack } from "metabase/ui";
import type { RegularCollectionId } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "../../../common/components/PaneHeader";

import S from "./NewSnippetPage.module.css";

const SNIPPET_NAME_MAX_LENGTH = 254;

type NewSnippetPageProps = {
  route: Route;
};

export function NewSnippetPage({ route }: NewSnippetPageProps) {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [createSnippet, { isLoading: isSaving }] = useCreateSnippetMutation();
  const isValid = name.length > 0 && content.length > 0;

  const handleCreateSnippet = async (
    collectionId: RegularCollectionId | null,
  ) => {
    try {
      const result = await createSnippet({
        name,
        content,
        description: description.trim().length > 0 ? description.trim() : null,
        collection_id: collectionId,
      }).unwrap();
      dispatch(push(Urls.dataStudioSnippet(result.id)));
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to create snippet`),
        icon: "warning",
      });
    }
  };

  const handleSave = async () => {
    if (!PLUGIN_SNIPPET_FOLDERS.isEnabled) {
      await handleCreateSnippet(null);
      return;
    }
    setIsCollectionPickerOpen(true);
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  const handleCollectionSelected = async (
    collectionId: RegularCollectionId | null,
  ) => {
    setIsCollectionPickerOpen(false);
    await handleCreateSnippet(collectionId);
  };

  const extensions = useMemo(() => [sql()], []);

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="background-primary"
        gap={0}
        data-testid="new-snippet-page"
      >
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New SQL snippet`}
              maxLength={SNIPPET_NAME_MAX_LENGTH}
              isOptional
              onContentChange={setName}
            />
          }
          actions={
            <PaneHeaderActions
              isValid={isValid}
              isDirty={true}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Flex flex={1} w="100%">
          <Box flex={1} className={S.editorContainer}>
            <CodeMirror
              value={content}
              onChange={setContent}
              extensions={extensions}
              height="100%"
              className={S.editor}
              data-testid="snippet-editor"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
              }}
            />
          </Box>
          <Stack
            w={320}
            gap="lg"
            p="md"
            bg="background-primary"
            className={S.sidebar}
          >
            <Box mx="-5px">
              <EditableText
                initialValue={description}
                placeholder={t`No description`}
                isMarkdown
                onChange={setDescription}
              />
            </Box>
          </Stack>
        </Flex>
      </Stack>
      <LeaveRouteConfirmModal route={route} isEnabled={!isSaving} />
      <PLUGIN_SNIPPET_FOLDERS.CollectionPickerModal
        isOpen={isCollectionPickerOpen}
        onSelect={handleCollectionSelected}
        onClose={() => setIsCollectionPickerOpen(false)}
      />
    </>
  );
}
