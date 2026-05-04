import { useRef } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import { useDeleteThemeFlow } from "metabase/admin/embedding/hooks";
import { useEmbeddingThemeEditor } from "metabase/admin/embedding/hooks/use-embedding-theme-editor";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal/LeaveRouteConfirmModal";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import { useDispatch } from "metabase/redux";
import { Flex, Loader, Stack } from "metabase/ui";

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
  // Suppresses the unsaved-changes prompt when we navigate away intentionally
  // (save or delete), since those flows leave the editor while `isDirty` is true.
  const isSavingRef = useRef(false);

  const goToThemeList = () => {
    dispatch(push("/admin/embedding/themes"));
  };

  const {
    requestDelete,
    modal: deleteModal,
    isDeleting,
  } = useDeleteThemeFlow({
    onDeleted: goToThemeList,
  });

  // Suppress the unsaved-changes prompt during delete: `isDeleting` is set
  // (state, so it triggers a re-render) before the mutation awaits, ensuring
  // the LeaveRouteConfirmModal sees `isEnabled=false` before the redirect.
  const shouldWarnOnLeave =
    editor.isDirty && !isSavingRef.current && !isDeleting;
  useBeforeUnload(shouldWarnOnLeave);

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

  // During deletion, the GET refetches and 404s after cache invalidation, but
  // the redirect to the theme list is on its way — don't flash NotFound.
  if (!isDeleting && (editor.isNotFound || !editor.currentTheme)) {
    return <NotFound />;
  }

  if (!editor.currentTheme) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Loader />
      </Stack>
    );
  }

  return (
    <Flex h="100%" style={{ overflow: "hidden" }}>
      <EditorPanel
        editor={editor}
        onSave={handleSave}
        onCancel={goToThemeList}
        onDelete={
          typeof themeId === "number" ? () => requestDelete(themeId) : undefined
        }
      />
      <PreviewPanel settings={editor.currentTheme.settings} />
      <LeaveRouteConfirmModal isEnabled={shouldWarnOnLeave} route={route} />
      {deleteModal}
    </Flex>
  );
}
