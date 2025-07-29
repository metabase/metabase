import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Button, Icon, Loader } from "metabase/ui";

import styles from "./MetabotCodeBlockComponent.module.css";

interface MetabotCodeBlockComponentProps {
  node: any;
  updateAttributes: (attrs: any) => void;
  selected: boolean;
  editor: any;
  getPos: () => number;
}

export const MetabotCodeBlockComponent = ({
  node,
  editor,
  getPos,
}: MetabotCodeBlockComponentProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleRun = () => {
    const content = node.textContent || "";
    // eslint-disable-next-line no-console
    console.log("Running metabot with content:", content);
    // eslint-disable-next-line no-console
    console.log("Setting isGenerating to true");
    setIsGenerating(true);
    // TODO: Implement actual metabot execution
    // For now, simulate a delay
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log("Setting isGenerating to false");
      setIsGenerating(false);
    }, 3000);
  };

  const handleStop = () => {
    setIsGenerating(false);
    // TODO: Implement actual metabot stop
    // eslint-disable-next-line no-console
    console.log("Stopping metabot generation");
  };

  // Handle backspace to remove empty metabot blocks
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        const content = node.textContent || "";
        const trimmedContent = content.trim();

        // If the block is empty or only contains whitespace, remove it
        if (trimmedContent === "") {
          event.preventDefault();
          const pos = getPos();
          editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run();
        }
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener("keydown", handleKeyDown);
      return () => {
        contentElement.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [node, editor, getPos]);

  // eslint-disable-next-line no-console
  console.log("Rendering MetabotCodeBlockComponent, isGenerating:", isGenerating);

  return (
    <NodeViewWrapper className={styles.metabotCodeBlock}>
      <Box className={styles.codeContainer}>
        <NodeViewContent
          className={styles.codeContent}
          ref={contentRef}
        />
      </Box>
      <Box className={styles.runButtonContainer}>
        {isGenerating && (
          <Button
            size="xs"
            variant="filled"
            leftSection={<Icon name="stop" size={12} />}
            onClick={handleStop}
          >
            {t`Stop`}
          </Button>
        )}
        <Button
          size="xs"
          variant="filled"
          leftSection={
            isGenerating ? (
              <Loader size="xs" />
            ) : (
              <Icon name="play" size={12} />
            )
          }
          onClick={handleRun}
          disabled={isGenerating}
        >
          {isGenerating ? t`Generating...` : t`Run`}
        </Button>
      </Box>
    </NodeViewWrapper>
  );
};
