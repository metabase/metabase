import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { t } from "ttag";

import { Box, Button, Icon } from "metabase/ui";

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
}: MetabotCodeBlockComponentProps) => {
  const handleRun = () => {
    const content = node.textContent || "";
    // eslint-disable-next-line no-console
    console.log("Running metabot with content:", content);
    // TODO: Implement actual metabot execution
  };

  return (
    <NodeViewWrapper className={styles.metabotCodeBlock}>
      <Box className={styles.codeContainer}>
        <NodeViewContent className={styles.codeContent} />
      </Box>
      <Box className={styles.runButtonContainer}>
        <Button
          size="xs"
          variant="filled"
          leftSection={<Icon name="play" size={12} />}
          onClick={handleRun}
        >
          {t`Run`}
        </Button>
      </Box>
    </NodeViewWrapper>
  );
};
