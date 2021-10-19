import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

import Notebook from "../../notebook/Notebook";
import { NotebookContainer } from "./QueryViewNotebook.styled";

const delayBeforeNotRenderingNotebook = 400;

const QueryViewNotebook = ({ isNotebookContainerOpen, ...props }) => {
  const [shouldShowNotebook, setShouldShowNotebook] = useState(
    isNotebookContainerOpen,
  );

  useEffect(() => {
    const delay = isNotebookContainerOpen ? 0 : delayBeforeNotRenderingNotebook;

    setTimeout(() => {
      setShouldShowNotebook(isNotebookContainerOpen);
    }, delay);
  }, [isNotebookContainerOpen]);

  return (
    <NotebookContainer
      isOpen={isNotebookContainerOpen}
      transitionTime={delayBeforeNotRenderingNotebook}
    >
      {shouldShowNotebook && <Notebook {...props} />}
    </NotebookContainer>
  );
};

QueryViewNotebook.propTypes = {
  isNotebookContainerOpen: PropTypes.bool.isRequired,
};

export default QueryViewNotebook;
