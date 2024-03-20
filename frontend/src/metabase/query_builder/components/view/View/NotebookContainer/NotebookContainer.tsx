import type { TransitionEventHandler } from "react";
import { useEffect, useState } from "react";

import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { Box } from "metabase/ui";

// There must exist some transition time, no matter how short,
// because we need to trigger the 'onTransitionEnd' in the component
const delayBeforeNotRenderingNotebook = 10;

interface NotebookContainerProps {
  isNotebookContainerOpen: boolean;
}

export const NotebookContainer = ({
  isNotebookContainerOpen,
  ...props
}: NotebookContainerProps) => {
  const [shouldShowNotebook, setShouldShowNotebook] = useState(
    isNotebookContainerOpen,
  );

  useEffect(() => {
    isNotebookContainerOpen && setShouldShowNotebook(isNotebookContainerOpen);
  }, [isNotebookContainerOpen]);

  const handleTransitionEnd: TransitionEventHandler<HTMLDivElement> = (
    event,
  ): void => {
    if (event.propertyName === "opacity" && !isNotebookContainerOpen) {
      setShouldShowNotebook(false);
    }
  };

  const transformStyle = isNotebookContainerOpen
    ? "translateY(0)"
    : "translateY(-100%)";

  return (
    <Box
      bg="white"
      pos="absolute"
      top={0}
      bottom={0}
      left={0}
      right={0}
      opacity={isNotebookContainerOpen ? 1 : 0}
      style={{
        zIndex: 2,
        overflowY: "auto",
        transform: transformStyle,
        transition: `transform ${delayBeforeNotRenderingNotebook}ms, opacity ${delayBeforeNotRenderingNotebook}ms`,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {shouldShowNotebook && <Notebook {...props} />}
    </Box>
  );
};
