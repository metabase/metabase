import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";
import { Box } from "grid-styled";

import Button from "metabase/components/Button";

import NotebookSteps from "./NotebookSteps";

const getCleanQuestion = (question) => {
  const cleanQuery = question.query().clean();

  let cleanQuestion = question.setQuery(cleanQuery);
  if (cleanQuestion.display() === "table") {
    cleanQuestion = cleanQuestion.setDefaultDisplay();
  }

  return cleanQuestion;
}

export default function Notebook({ className, ...props }) {
  const {
    question,
    isRunnable,
    isResultDirty,
    runQuestionQuery,
    setQueryBuilderMode,
  } = props;

  const handleClick = async () => {
    const cleanQuestion = getCleanQuestion(question);

    await cleanQuestion.update();

    // switch mode before running otherwise URL update may cause it to switch back to notebook mode
    await setQueryBuilderMode("view");

    if (isResultDirty) {
      await runQuestionQuery();
    }
  }

  return (
    <Box className={cx(className, "relative mb4")} px={[2, 3]}>
      <NotebookSteps {...props} />
      {isRunnable && (
        <Button
          medium
          primary
          style={{ minWidth: 220 }}
          onClick={handleClick}
        >
          {t`Visualize`}
        </Button>
      )}
    </Box>
  );
}

Notebook.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object,
  isRunnable: PropTypes.bool.isRequired,
  isResultDirty: PropTypes.bool.isRequired,
  runQuestionQuery: PropTypes.func.isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
}
