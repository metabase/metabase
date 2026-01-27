import { sql } from "@codemirror/lang-sql";
import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetSnippetQuery,
  useUpdateSnippetMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card, Center, Flex, Stack } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";

import { PaneHeaderActions } from "../../../common/components/PaneHeader";
import { SnippetDescriptionSection } from "../../components/SnippetDescriptionSection";
import { SnippetHeader } from "../../components/SnippetHeader";

import S from "./EditSnippetPage.module.css";

type EditSnippetPageParams = {
  snippetId: string;
};

type EditSnippetPageProps = {
  params: EditSnippetPageParams;
  route: Route;
};

export function EditSnippetPage({ params, route }: EditSnippetPageProps) {
  const snippetId = Urls.extractEntityId(params.snippetId);
  const [sendToast] = useToast();
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const {
    data: snippet,
    isLoading,
    error,
  } = useGetSnippetQuery(snippetId ?? skipToken);

  const [content, setContent] = useState(snippet?.content ?? "");
  const [updateSnippet, { isLoading: isSaving }] = useUpdateSnippetMutation();

  const isDirty = useMemo(
    () => snippet != null && content !== snippet.content,
    [content, snippet],
  );

  const previousSnippet = usePreviousDistinct(snippet);
  useLayoutEffect(() => {
    if (snippet && previousSnippet?.id !== snippet.id) {
      setContent(snippet.content);
    }
  }, [snippet, previousSnippet]);

  const handleSave = async () => {
    if (!snippet) {
      return;
    }

    const { error } = await updateSnippet({
      id: snippet.id,
      content,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to update snippet content`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`Snippet content updated`,
        icon: "check",
      });
    }
  };

  const handleCancel = () => {
    if (snippet) {
      setContent(snippet.content);
    }
  };

  const extensions = useMemo(() => [sql()], []);

  if (isLoading || error || !snippet) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <>
      <PageContainer pos="relative" data-testid="edit-snippet-page">
        <SnippetHeader
          snippet={snippet}
          actions={
            <PaneHeaderActions
              isValid={true}
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
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
              editable={!remoteSyncReadOnly}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
              }}
            />
          </Card>
          <Stack p="md" gap="lg" flex="0 0 20rem">
            <SnippetDescriptionSection
              snippet={snippet}
              isDisabled={remoteSyncReadOnly}
            />
            <EntityCreationInfo
              createdAt={snippet.created_at}
              creator={snippet.creator}
            />
          </Stack>
        </Flex>
      </PageContainer>
      <LeaveRouteConfirmModal
        key={snippetId}
        route={route}
        isEnabled={isDirty && !isSaving}
      />
    </>
  );
}
