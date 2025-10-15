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

        // The copied data IS the dataset_query itself
        // Validate it has the expected structure (database, type, query fields)
        if (!pastedData || typeof pastedData !== "object") {
          // If it doesn't have the expected structure, silently ignore
          return;
        }

        // Validate it looks like a dataset_query (has database, type, and query)
        if (!pastedData.database || !pastedData.type || !pastedData.query) {
          // If it doesn't have the expected structure, silently ignore
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
          onOpenModal("paste-query", { pastedDatasetQuery: pastedData });
        } else {
          // For empty questions, paste directly without confirmation
          onOpenModal("paste-query", {
            pastedDatasetQuery: pastedData,
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
