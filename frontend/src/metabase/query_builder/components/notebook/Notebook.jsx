import React from "react";

import { t } from "ttag";
import cx from "classnames";
import { Box } from "grid-styled";

import Button from "metabase/components/Button";

import NotebookSteps from "./NotebookSteps";

export default function Notebook({ className, ...props }) {
  const {
    question,
    isRunnable,
    isResultDirty,
    runQuestionQuery,
    onSetQueryBuilderMode,
  } = props;
  return (
    <Box className={cx(className, "relative wrapper mb4")}>
      <NotebookSteps {...props} />
      {isRunnable && (
        <Button
          medium
          primary
          onClick={async () => {
            if (question.display() === "table") {
              await question.setDisplayAutomatically().update();
            }
            if (isResultDirty) {
              runQuestionQuery();
            }
            onSetQueryBuilderMode("view");
          }}
        >
          {t`Visualize`}
        </Button>
      )}
    </Box>
  );
}
