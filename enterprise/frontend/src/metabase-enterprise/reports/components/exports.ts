import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import {
  CARD_EMBED_PATTERN,
  SMART_LINK_PATTERN,
  SPACER_PATTERN,
} from "./Editor/extensions/markdown/card-embed-format";
import type { CardEmbedRef } from "./Editor/types";

// Helper function to convert a question to PNG data URL using existing Metabase utilities
export const convertQuestionToPng = async (
  cardId: number,
): Promise<string | null> => {
  try {
    // Use the existing chart selection and PNG generation system
    const cardSelector = getChartSelector({ cardId });
    const pngDataUrl = await getChartImagePngDataUri(cardSelector);
    return pngDataUrl || null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to convert question ${cardId} to PNG:`, error);
    return null;
  }
};

export const getDownloadableMarkdown = async (
  markdown: string,
  cardEmbeds: CardEmbedRef[],
): Promise<string> => {
  let processedMarkdown = markdown;

  // First, remove all spacers
  processedMarkdown = processedMarkdown.replace(SPACER_PATTERN, "");

  // Replace smart links with regular markdown links
  processedMarkdown = processedMarkdown.replace(
    SMART_LINK_PATTERN,
    (match, url, text) => `[${text}](${url})`,
  );

  // Extract card references from markdown using shared regex pattern
  const cardMatches = Array.from(
    processedMarkdown.matchAll(CARD_EMBED_PATTERN),
  );

  // eslint-disable-next-line no-console
  console.log("Processing cards found in markdown:", cardMatches.length);

  if (cardMatches.length === 0) {
    return processedMarkdown;
  }

  for (let i = 0; i < cardMatches.length; i++) {
    const match = cardMatches[i];
    const [fullMatch, cardIdStr, customName] = match;
    const cardId = parseInt(cardIdStr, 10);

    try {
      // Convert question to PNG using existing Metabase utilities
      const pngDataUrl = await convertQuestionToPng(cardId);

      if (!pngDataUrl) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to generate PNG for question ${cardId}`);
        continue;
      }

      // Get question name from cardEmbed for fallback
      const cardEmbed = cardEmbeds.find((ref: any) => ref.id === cardId);
      const displayName = customName || cardEmbed?.name || `Question ${cardId}`;

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
      console.error(`Failed to process card ${cardId}:`, error);
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
