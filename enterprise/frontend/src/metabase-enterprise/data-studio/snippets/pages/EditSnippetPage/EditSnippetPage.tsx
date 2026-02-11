import { sql } from "@codemirror/lang-sql";
import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
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
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex, Stack } from "metabase/ui";

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

  useLayoutEffect(() => {
    if (snippet) {
      setContent(snippet.content);
    }
  }, [snippet]);

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
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="background-primary"
        gap={0}
        data-testid="edit-snippet-page"
      >
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
            <SnippetDescriptionSection snippet={snippet} />
            <EntityCreationInfo
              createdAt={snippet.created_at}
              creator={snippet.creator}
            />
          </Stack>
        </Flex>
      </Stack>
      <LeaveRouteConfirmModal
        key={snippetId}
        route={route}
        isEnabled={isDirty && !isSaving}
      />
    </>
  );
}
