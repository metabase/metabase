import React from "react";

import QueryModals from "../QueryModals";
import GuiQueryEditor from "../GuiQueryEditor";

import NotebookHeader from "./NotebookHeader";
import NotebookSteps from "./NotebookSteps";

import { Box } from "grid-styled";
import { t } from "ttag";

import cx from "classnames";
import Button from "metabase/components/Button";

const legacy = false;

const Notebook = ({ className, ...props }) => {
  return (
    <Box className={cx(className, "relative mb4")}>
      <NotebookHeader {...props} className="absolute top right" />
      <NotebookSteps {...props} className="pt3" />
      {/* temporary mouse travel usability test */
      props.isRunnable && (
        <Button
          medium
          primary
          ml={3}
          onClick={() => {
            if (props.isResultDirty) {
              props.runQuestionQuery();
            }
            props.onSetQueryBuilderMode("view");
          }}
        >
        {t`Visualize`}
        </Button>
      )}

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
