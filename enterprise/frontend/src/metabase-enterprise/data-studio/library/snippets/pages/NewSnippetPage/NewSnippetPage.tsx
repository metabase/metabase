import { sql } from "@codemirror/lang-sql";
import { useEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { Card, Flex, Stack } from "metabase/ui";
import type { NativeQuerySnippet,RegularCollectionId } from "metabase-types/api";

import S from "./NewSnippetPage.module.css";

const SNIPPET_NAME_MAX_LENGTH = 254;

type NewSnippetPageProps = {
  route: Route;
};

export function NewSnippetPage({ route }: NewSnippetPageProps) {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [name, setName] = useState(t`New SQL snippet`);
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [savedSnippet, setSavedSnippet] = useState<NativeQuerySnippet | null>(
    null,
  );
  const [createSnippet, { isLoading: isSaving }] = useCreateSnippetMutation();
  const isValid = name.length > 0 && content.length > 0;

  const handleCreateSnippet = async (
    collectionId: RegularCollectionId | null,
  ) => {
    const { data: snippet, error } = await createSnippet({
      name,
      content,
      description: description.trim().length > 0 ? description.trim() : null,
      collection_id: collectionId,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to create snippet`),
        icon: "warning",
      });
    } else if (snippet) {
      setSavedSnippet(snippet);
    }
  };

  useEffect(() => {
    if (savedSnippet) {
      dispatch(push(Urls.dataStudioSnippet(savedSnippet.id)));
    }
  }, [savedSnippet, dispatch]);

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
      <PageContainer pos="relative" data-testid="new-snippet-page">
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
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataStudioLibrary()}>{t`SQL snippets`}</Link>
              {t`New Snippet`}
            </DataStudioBreadcrumbs>
          }
        />
        <Flex flex={1} w="100%" gap="sm">
          <Card
            withBorder
            p={0}
            w="100%"
            flex={1}
            style={{
              overflow: "hidden",
            }}
          >
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
          </Card>
          <Stack p="md" flex="0 0 20rem">
            <EditableText
              initialValue={description}
              placeholder={t`No description`}
              isMarkdown
              onChange={setDescription}
            />
          </Stack>
        </Flex>
      </PageContainer>
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={!savedSnippet && !isSaving}
      />
      <PLUGIN_SNIPPET_FOLDERS.CollectionPickerModal
        isOpen={isCollectionPickerOpen}
        onSelect={handleCollectionSelected}
        onClose={() => setIsCollectionPickerOpen(false)}
      />
    </>
  );
}
