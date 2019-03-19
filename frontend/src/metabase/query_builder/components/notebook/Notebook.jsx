import React from "react";

import QueryModals from "../QueryModals";
import GuiQueryEditor from "../GuiQueryEditor";

import NotebookHeader from "./NotebookHeader";
import NotebookSteps from "./NotebookSteps";

import { Box } from "grid-styled";

import cx from "classnames";

const legacy = false;

const Notebook = ({ className, ...props }) => {
  return (
    <Box className={cx(className, "relative")}>
      <NotebookHeader {...props} className="absolute top right" />
      <NotebookSteps {...props} className="pt3" />

      {legacy && (
        <div className="fixed bottom left right p2">
          <GuiQueryEditor {...props} />
        </div>
      )}

      <QueryModals {...props} />
    </Box>
  );
};

export default Notebook;
