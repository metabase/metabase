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
    setQueryBuilderMode,
  } = props;
  return (
    <Box className={cx(className, "relative mb4")} px={[2, 3]}>
      <NotebookSteps {...props} />
      {isRunnable && (
        <Button
          medium
          primary
          style={{ minWidth: 220 }}
          onClick={async () => {
            let cleanQuestion = question.setQuery(question.query().clean());
            if (cleanQuestion.display() === "table") {
              cleanQuestion = cleanQuestion.setDefaultDisplay();
            }
            await cleanQuestion.update();
            // switch mode before running otherwise URL update may cause it to switch back to notebook mode
            await setQueryBuilderMode("view");
            if (isResultDirty) {
              await runQuestionQuery();
            }
          }}
        >
          {t`Visualize`}
        </Button>
      )}
    </Box>
  );
}
