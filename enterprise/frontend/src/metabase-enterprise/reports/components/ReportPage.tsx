import { useCallback, useState } from "react";
import { t } from "ttag";

import { Box, Button, Icon, Loader, Stack, Text } from "metabase/ui";
import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import { Editor } from "./Editor";
import styles from "./ReportPage.module.css";

export const ReportPage = () => {
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");

  const handleSave = useCallback(() => {
    if (!editorInstance) {
      return;
    }

    const markdown = editorInstance.storage.markdown?.getMarkdown();
    const reportData = {
      title: "New Report",
      content: markdown,
      questionReferences: questionRefs,
      createdAt: new Date().toISOString(),
    };

    // eslint-disable-next-line no-console
    console.log("Report data to save:", reportData);
  }, [editorInstance, questionRefs]);

  const handleQuestionClick = useCallback(
    (questionId: number) => {
      if (!editorInstance) {
        return;
      }

      // Find the question embed node in the document
      const { doc } = editorInstance.state;
      let targetPos = null;

      doc.descendants((node: any, pos: number) => {
        if (
          node.type.name === "questionEmbed" &&
          node.attrs.questionId === questionId
        ) {
          targetPos = pos;
          return false;
        }
      });

      if (targetPos !== null) {
        // Scroll to the node and highlight it
        editorInstance
          .chain()
          .focus()
          .setTextSelection(targetPos)
          .scrollIntoView()
          .run();

        // Add highlight effect
        const domNode = editorInstance.view.nodeDOM(targetPos);
        if (domNode) {
          domNode.classList.add(styles.highlighted);
          setTimeout(() => {
            domNode.classList.remove(styles.highlighted);
          }, 2000);
        }
      }
    },
    [editorInstance],
  );

  // Helper function to convert a question to PNG data URL using existing Metabase utilities
  const convertQuestionToPng = useCallback(
    async (questionId: number): Promise<string | null> => {
      try {
        // Use the existing chart selection and PNG generation system
        const cardSelector = getChartSelector({ cardId: questionId });
        const pngDataUrl = await getChartImagePngDataUri(cardSelector);
        return pngDataUrl || null;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          `Failed to convert question ${questionId} to PNG:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  // Helper function to process cards and convert them to embedded images
  const processCardsForDownload = useCallback(
    async (markdown: string): Promise<string> => {
      let processedMarkdown = markdown;

      // Extract card references from markdown using regex
      const cardPattern = /{{card:(\d+)(?::([^}]+))?}}/g;
      const cardMatches = Array.from(markdown.matchAll(cardPattern));

      // eslint-disable-next-line no-console
      console.log("Processing cards found in markdown:", cardMatches.length);

      if (cardMatches.length === 0) {
        setDownloadProgress("📝 Preparing your markdown...");
        return processedMarkdown;
      }

      const whimsicalMessages = [
        "🎨 Capturing beautiful charts...",
        "📸 Taking snapshots of data...",
        "✨ Sprinkling magic on visualizations...",
        "🔮 Converting charts to pixels...",
        "🎭 Making data picture-perfect...",
        "🌟 Polishing your visualizations...",
        "🎪 Gathering chart circus performers...",
        "🦋 Transforming data into butterflies...",
        "🎨 Painting data masterpieces...",
        "🪄 Weaving visualization spells...",
      ];

      for (let i = 0; i < cardMatches.length; i++) {
        const match = cardMatches[i];
        const [fullMatch, questionIdStr, customName] = match;
        const questionId = parseInt(questionIdStr, 10);

        // Show whimsical progress message
        const messageIndex = i % whimsicalMessages.length;
        const progressMessage = `${whimsicalMessages[messageIndex]} (${i + 1}/${cardMatches.length})`;
        setDownloadProgress(progressMessage);

        try {
          // Convert question to PNG using existing Metabase utilities
          const pngDataUrl = await convertQuestionToPng(questionId);

          if (!pngDataUrl) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to generate PNG for question ${questionId}`);
            continue;
          }

          // Get question name from questionRefs for fallback
          const questionRef = questionRefs.find((ref) => ref.id === questionId);
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

      setDownloadProgress("🎉 Almost ready...");
      return processedMarkdown;
    },
    [convertQuestionToPng, questionRefs],
  );

  const handleDownloadMarkdown = useCallback(async () => {
    if (!editorInstance || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setDownloadProgress("🚀 Starting download...");

    try {
      // Get the markdown content from the editor
      const markdown = editorInstance.storage.markdown?.getMarkdown();
      if (!markdown) {
        // eslint-disable-next-line no-console
        console.error("No markdown content available");
        return;
      }

      // Process embedded cards to convert them to PNG images
      const processedMarkdown = await processCardsForDownload(markdown);

      setDownloadProgress("💾 Creating your file...");

      // Create and download the file
      const blob = new Blob([processedMarkdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `report-${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(link);

      setDownloadProgress("🎊 Download complete!");
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Brief delay to show completion message
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress("");
      }, 1500);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to download markdown:", error);
      setDownloadProgress("😞 Something went wrong...");

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress("");
      }, 2000);
    }
  }, [editorInstance, isDownloading, processCardsForDownload]);

  return (
    <Box className={styles.reportPage}>
      <Box className={styles.mainContent}>
        <Box className={styles.documentContainer}>
          <Editor
            onEditorReady={setEditorInstance}
            onQuestionRefsChange={setQuestionRefs}
          />
        </Box>
      </Box>

      <Box className={styles.sidebar}>
        <Stack gap="lg" p="lg">
          <Button variant="filled" onClick={handleSave} fullWidth>
            {t`Save Report`}
          </Button>

          <Button
            variant="outline"
            onClick={handleDownloadMarkdown}
            fullWidth
            disabled={isDownloading}
            leftSection={
              isDownloading ? (
                <Loader size="xs" color="currentColor" />
              ) : (
                <Icon name="download" />
              )
            }
          >
            {isDownloading
              ? downloadProgress || t`Preparing download...`
              : t`Download Markdown`}
          </Button>

          <Box>
            <Text size="sm" fw="bold" mb="sm">
              {t`Question References`}
            </Text>
            {questionRefs.length === 0 ? (
              <Text size="sm" color="text-light">
                {t`No questions embedded yet`}
              </Text>
            ) : (
              <Stack fw="xs">
                {questionRefs.map((ref) => (
                  <Box
                    key={ref.id}
                    className={styles.questionRef}
                    onClick={() => handleQuestionClick(ref.id)}
                  >
                    <Text size="sm">{ref.name}</Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};
