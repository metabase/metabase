import { useRef } from "react";
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
  const themeId =
    params.themeId === "new" ? "new" : parseInt(params.themeId, 10);
  const editor = useEmbeddingThemeEditor(themeId);
  const dispatch = useDispatch();
  const isSavingRef = useRef(false);

  const shouldWarnOnLeave = editor.isDirty && !isSavingRef.current;
  useBeforeUnload(shouldWarnOnLeave);

  const goToThemeList = () => {
    dispatch(push("/admin/embedding/themes"));
  };

  const handleSave = async () => {
    isSavingRef.current = true;
    await editor.handleSave();
    goToThemeList();
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
      <EditorPanel
        editor={editor}
        onSave={handleSave}
        onCancel={goToThemeList}
      />
      <PreviewPanel settings={editor.currentTheme.settings} />
      <LeaveRouteConfirmModal isEnabled={shouldWarnOnLeave} route={route} />
    </Flex>
  );
}
