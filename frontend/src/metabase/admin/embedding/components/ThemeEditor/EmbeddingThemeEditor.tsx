import { useCallback, useEffect } from "react";
import type { InjectedRouter } from "react-router";
import { withRouter } from "react-router";
import { t } from "ttag";

import { Box, Button, Flex, Group, Stack } from "metabase/ui";

import { EmbeddingThemeEditorProvider } from "./EmbeddingThemeEditorProvider";
import { EmbeddingThemeEditorSidebar } from "./EmbeddingThemeEditorSidebar";
import { EmbeddingThemePreview } from "./EmbeddingThemePreview";
import { useEmbeddingThemeEditor } from "./context";
import S from "./EmbeddingThemeEditor.module.css";

interface EmbeddingThemeEditorContentProps {
  router: InjectedRouter;
}

const EmbeddingThemeEditorContentBase = ({
  router,
}: EmbeddingThemeEditorContentProps) => {
  const { isDirty, saveTheme, isSaving } = useEmbeddingThemeEditor();

  const handleCancel = useCallback(() => {
    router.push("/admin/embedding/themes");
  }, [router]);

  const handleSave = useCallback(async () => {
    await saveTheme();
    router.push("/admin/embedding/themes");
  }, [saveTheme, router]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  return (
    <Box className={S.Container}>
      <Box className={S.Sidebar} component="aside">
        <Box className={S.SidebarContent}>
          <EmbeddingThemeEditorSidebar />
        </Box>

        <Group className={S.Navigation} justify="space-between">
          <Button variant="default" onClick={handleCancel}>
            {t`Cancel`}
          </Button>

          <Button
            variant="filled"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            loading={isSaving}
          >
            {t`Save theme`}
          </Button>
        </Group>
      </Box>

      <Box className={S.PreviewPanel} h="98%">
        <EmbeddingThemePreview />
      </Box>
    </Box>
  );
};

const EmbeddingThemeEditorContent = withRouter(EmbeddingThemeEditorContentBase);

interface EmbeddingThemeEditorProps {
  params: { id: string };
}

const EmbeddingThemeEditorBase = ({ params }: EmbeddingThemeEditorProps) => {
  const themeId = parseInt(params.id ?? "0", 10);

  if (!themeId || isNaN(themeId)) {
    return <div>{t`Invalid theme ID`}</div>;
  }

  return (
    <EmbeddingThemeEditorProvider themeId={themeId}>
      <EmbeddingThemeEditorContent />
    </EmbeddingThemeEditorProvider>
  );
};

export const EmbeddingThemeEditor = withRouter(EmbeddingThemeEditorBase);
