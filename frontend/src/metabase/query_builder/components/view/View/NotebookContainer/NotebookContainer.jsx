import PropTypes from "prop-types";
import { useEffect, useState } from "react";

import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { Flex } from "metabase/ui";
const delayBeforeNotRenderingNotebook = 10;

export const NotebookContainer = ({ isNotebookContainerOpen, ...props }) => {
  const [shouldShowNotebook, setShouldShowNotebook] = useState(
    isNotebookContainerOpen,
  );

  useEffect(() => {
    isNotebookContainerOpen && setShouldShowNotebook(isNotebookContainerOpen);
  }, [isNotebookContainerOpen]);

  const handleTransitionEnd = event => {
    if (event.propertyName === "opacity" && !isNotebookContainerOpen) {
      setShouldShowNotebook(false);
    }
  };

  const transformStyle = isNotebookContainerOpen
    ? "translateY(0)"
    : "translateY(-100%)";

  return (
    <Flex
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
    </Flex>
  );
};

NotebookContainer.propTypes = {
  isNotebookContainerOpen: PropTypes.bool.isRequired,
};
