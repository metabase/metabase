import { useState } from "react";
import { t } from "ttag";

import { useDeleteEmbeddingThemeMutation } from "metabase/api/embedding-theme";
import { useToast } from "metabase/common/hooks";

import { DeleteThemeModal } from "../components/ThemeListing/DeleteThemeModal";

interface UseDeleteThemeFlowOptions {
  onDeleted?: () => void;
}

export function useDeleteThemeFlow({
  onDeleted,
}: UseDeleteThemeFlowOptions = {}) {
  const [deleteTheme] = useDeleteEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const [themeToDelete, setThemeToDelete] = useState<number | null>(null);

  const requestDelete = (themeId: number) => setThemeToDelete(themeId);
  const cancelDelete = () => setThemeToDelete(null);

  const confirmDelete = async () => {
    if (themeToDelete === null) {
      return;
    }
    try {
      await deleteTheme(themeToDelete).unwrap();
      sendToast({ message: t`Theme deleted successfully`, icon: "check" });
      setThemeToDelete(null);
      onDeleted?.();
    } catch (error) {
      console.error("Failed to delete theme:", error);
      sendToast({ message: t`Failed to delete theme`, icon: "warning" });
    }
  };

  const modal = (
    <DeleteThemeModal
      isOpen={themeToDelete !== null}
      onCancel={cancelDelete}
      onDelete={confirmDelete}
    />
  );

  return { requestDelete, modal };
}
