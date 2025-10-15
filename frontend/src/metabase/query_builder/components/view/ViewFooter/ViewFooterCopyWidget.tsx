import { useCallback, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast/use-toast";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import {
  getFirstQueryResult,
  getQuestion,
} from "metabase/query_builder/selectors";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import { getDomToCanvas } from "metabase/visualizations/lib/image-exports";

// Custom function that includes theme background support
const getChartImagePngDataUriWithTheme = async (
  selector: string,
): Promise<string | undefined> => {
  const chartRoot = document.querySelector(selector);

  if (!chartRoot || !(chartRoot instanceof HTMLElement)) {
    console.warn("No chart element found", selector);
    return undefined;
  }

  const canvas = await getDomToCanvas(chartRoot, {
    onclone: (_doc: Document, node: HTMLElement) => {
      node.classList.add("saving-dom-image");
      node.classList.add(EmbedFrameS.WithThemeBackground);
    },
  });

  return canvas.toDataURL("image/png");
};

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

      // Use the same image generation as the download functionality but with theme support
      const dataUri = await getChartImagePngDataUriWithTheme(chartSelector);

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

  // Don't show copy button for tables and pivot tables since they only show visible rows
  if (question.display() === "table" || question.display() === "pivot") {
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
