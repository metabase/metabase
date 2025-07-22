import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

// Helper function to convert a question to PNG data URL using existing Metabase utilities
export const convertQuestionToPng = async (
  questionId: number,
): Promise<string | null> => {
  try {
    // Use the existing chart selection and PNG generation system
    const cardSelector = getChartSelector({ cardId: questionId });
    const pngDataUrl = await getChartImagePngDataUri(cardSelector);
    return pngDataUrl || null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to convert question ${questionId} to PNG:`, error);
    return null;
  }
};

export const getDownloadableMarkdown = async (
  markdown: string,
  questionRefs: any,
): Promise<string> => {
  let processedMarkdown = markdown;

  // Extract card references from markdown using regex
  const cardPattern = /{{card:(\d+)(?::([^}]+))?}}/g;
  const cardMatches = Array.from(markdown.matchAll(cardPattern));

  // eslint-disable-next-line no-console
  console.log("Processing cards found in markdown:", cardMatches.length);

  if (cardMatches.length === 0) {
    return processedMarkdown;
  }

  for (let i = 0; i < cardMatches.length; i++) {
    const match = cardMatches[i];
    const [fullMatch, questionIdStr, customName] = match;
    const questionId = parseInt(questionIdStr, 10);

    try {
      // Convert question to PNG using existing Metabase utilities
      const pngDataUrl = await convertQuestionToPng(questionId);

      if (!pngDataUrl) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to generate PNG for question ${questionId}`);
        continue;
      }

      // Get question name from questionRefs for fallback
      const questionRef = questionRefs.find(
        (ref: any) => ref.id === questionId,
      );
      const displayName =
        customName || questionRef?.name || `Question ${questionId}`;

      // Replace the specific card reference in markdown with embedded image
      const specificPattern = new RegExp(
        fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g",
      );
      processedMarkdown = processedMarkdown.replace(
        specificPattern,
        `![${displayName}](${pngDataUrl})`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to process card ${questionId}:`, error);
      // Keep the original card reference if conversion fails
    }
  }

  return processedMarkdown;
};

export const downloadFile = (markdown: string) => {
  // Create and download the file
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `report-${new Date().toISOString().split("T")[0]}.md`;
  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
