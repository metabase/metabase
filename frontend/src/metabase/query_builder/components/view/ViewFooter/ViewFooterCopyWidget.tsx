import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast/use-toast";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import {
  getFirstQueryResult,
  getQuestion,
} from "metabase/query_builder/selectors";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import { getChartImagePngDataUri } from "metabase/visualizations/lib/image-exports";

export const ViewFooterCopyWidget = () => {
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendToast] = useToast();

  const handleCopy = useCallback(async () => {
    if (!question || !result) {
      return;
    }

    setCopying(true);
    try {
      // Check if clipboard API is supported
      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error("Clipboard API not supported");
      }

      // Use the same selector as the download functionality
      const cardKey = question.id() ? `${question.id()}` : "unsaved";
      const chartSelector = `[data-card-key='${cardKey}']`;

      // Check if visualization element exists
      const visualizationElement = document.querySelector(chartSelector);

      if (!visualizationElement) {
        throw new Error("Visualization not found");
      }

      // Use the same image generation as the download functionality
      const dataUri = await getChartImagePngDataUri(chartSelector);

      if (!dataUri) {
        throw new Error("Failed to generate image");
      }

      // Convert data URI to blob without using fetch (CSP issue)
      const base64Data = dataUri.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "image/png" });

      if (!blob || blob.size === 0) {
        throw new Error("Generated image is empty");
      }

      // Try to copy to clipboard
      try {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
      } catch (clipboardError) {
        // Fallback: try copying as text (data URL)
        console.warn("Blob clipboard failed, trying data URL:", clipboardError);
        await navigator.clipboard.writeText(dataUri);
      }

      setCopied(true);
      sendToast({
        message: t`Chart image copied to clipboard`,
        icon: "check",
        timeout: 3000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      sendToast({
        message:
          error instanceof Error
            ? error.message
            : t`Unable to copy chart image. Please try downloading instead.`,
        icon: "warning",
        timeout: 5000,
      });
    } finally {
      setCopying(false);
    }
  }, [question, result, sendToast]);

  if (!question || !result) {
    return null;
  }

  return (
    <Tooltip
      label={copied ? t`Copied!` : copying ? t`Copying…` : t`Copy to clipboard`}
    >
      <ActionIcon
        data-testid="question-results-copy-button"
        onClick={handleCopy}
        disabled={copying}
        variant="viewFooter"
        aria-label={
          copied ? t`Copied!` : copying ? t`Copying…` : t`Copy to clipboard`
        }
        className={CS.hoverChild}
      >
        <Icon name={copying ? "hourglass" : "copy"} />
      </ActionIcon>
    </Tooltip>
  );
};
