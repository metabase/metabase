import { useCallback } from "react";

import type Question from "metabase-lib/v1/Question";

interface UsePasteQueryProps {
  question: Question | undefined;
  updateQuestion: (question: Question) => void;
  onOpenModal: (modalType: string, context?: any) => void;
}

export const usePasteQuery = ({
  question,
  onOpenModal,
}: UsePasteQueryProps) => {
  const handlePaste = useCallback(() => {
    // Use a synchronous approach by reading clipboard in a non-blocking way
    navigator.clipboard
      .readText()
      .then((clipboardText) => {
        // Try to parse as JSON
        let pastedData;
        try {
          pastedData = JSON.parse(clipboardText);
        } catch (error) {
          // If it's not valid JSON, silently ignore (allow default paste behavior)
          return;
        }

        // Check if this is the new format (object with dataset_query property) or old format (raw dataset_query)
        let datasetQuery;
        if (pastedData.dataset_query) {
          // New format: { dataset_query, display, visualization_settings, parameters }
          datasetQuery = pastedData.dataset_query;
        } else if (pastedData.database && pastedData.type && pastedData.query) {
          // Old format: raw dataset_query
          datasetQuery = pastedData;
        } else {
          // If it doesn't have the expected structure, silently ignore
          return;
        }

        // Validate the dataset_query has the expected structure
        if (!datasetQuery || typeof datasetQuery !== "object") {
          return;
        }

        // Check if this is an empty question (no existing query)
        const hasExistingQuery =
          question &&
          question.datasetQuery() &&
          question.datasetQuery().type &&
          question.datasetQuery().database;

        if (hasExistingQuery) {
          // Show confirmation modal for existing queries
          onOpenModal("paste-query", { pastedData: pastedData });
        } else {
          // For empty questions, paste directly without confirmation
          onOpenModal("paste-query", {
            pastedData: pastedData,
            skipConfirmation: true,
          });
        }
      })
      .catch((error) => {
        // If clipboard access fails, silently ignore
        console.warn("Failed to read from clipboard:", error);
      });
  }, [question, onOpenModal]);

  return { handlePaste };
};
