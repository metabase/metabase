import type { Route } from "react-router";
import { push } from "react-router-redux";

import { useEmbeddingThemeEditor } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal/LeaveRouteConfirmModal";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import { Flex, Loader, Stack } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { EditorPanel } from "./EditorPanel";
import { PreviewPanel } from "./PreviewPanel";

interface EmbeddingThemeEditorAppProps {
  params: { themeId: string };
  route: Route;
}

export function EmbeddingThemeEditorApp({
  params,
  route,
}: EmbeddingThemeEditorAppProps) {
  const themeId = parseInt(params.themeId, 10);
  const editor = useEmbeddingThemeEditor(themeId);
  const dispatch = useDispatch();

  useBeforeUnload(editor.isDirty);

  const handleCancel = () => {
    dispatch(push("/admin/embedding/themes"));
  };

  if (editor.isLoading) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Loader />
      </Stack>
    );
  }

  if (editor.isNotFound || !editor.currentTheme) {
    return <NotFound />;
  }

  return (
    <Flex h="100%" style={{ overflow: "hidden" }}>
      <EditorPanel editor={editor} onCancel={handleCancel} />
      <PreviewPanel settings={editor.currentTheme.settings} />
      <LeaveRouteConfirmModal isEnabled={editor.isDirty} route={route} />
    </Flex>
  );
}
