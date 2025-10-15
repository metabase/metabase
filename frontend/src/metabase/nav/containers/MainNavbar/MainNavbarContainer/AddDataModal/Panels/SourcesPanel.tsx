import { push } from "react-router-redux";

import { databaseApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";
import { SourcesList } from "./SourcesList";

export const SourcesPanel = ({
  canSeeContent,
  onAddDataModalClose,
}: {
  canSeeContent: boolean;
  onAddDataModalClose: () => void;
}) => {
  const dispatch = useDispatch();

  const handleSourceSubmit = async (data: {
    name: string;
    source: string;
    details: Record<string, string>;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/database/source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error:
            errorData.message ||
            `Failed to add source (${response.status} ${response.statusText})`,
        };
      }

      const result = await response.json();

      if (result.id) {
        dispatch(
          databaseApi.util.invalidateTags([{ type: "database", id: "LIST" }]),
        );
        onAddDataModalClose();
        dispatch(push(`/browse/databases/${result.id}`));
      }

      return { success: true };
    } catch (error) {
      console.error("Error adding source:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      };
    }
  };

  return canSeeContent ? (
    <SourcesList onSubmit={handleSourceSubmit} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
