import React from "react";

import QueryModals from "../QueryModals";
import GuiQueryEditor from "../GuiQueryEditor";

import NotebookHeader from "./NotebookHeader";
import NotebookSteps from "./NotebookSteps";

const legacy = false;

const Notebook = props => {
  return (
    <div className="pb4">
      <NotebookHeader {...props} />

      <NotebookSteps {...props} />

      {legacy && (
        <div className="fixed bottom left right p2">
          <GuiQueryEditor {...props} />
        </div>
      )}

      <QueryModals {...props} />
    </div>
  );
};

export default Notebook;
