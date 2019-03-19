import React from "react";

import Icon from "metabase/components/Icon";
import { Box, Flex } from "grid-styled";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import Question from "metabase-lib/lib/Question";

const NotebookStepPreview = ({ step, onClose, ...props }) => {
  const query = step.previewQuery;
  const question = Question.create().setQuery(query.updateLimit(10));
  return (
    <Box p={2}>
      <Flex align="center" mb={1}>
        <span className="text-bold">{`Preview`}</span>
        <Icon
          name="close"
          onClick={onClose}
          className="text-light text-medium-hover cursor-pointer ml1"
        />
      </Flex>
      <QuestionResultLoader question={question}>
        {props => (
          <Visualization
            {...props}
            className="bordered shadowed rounded bg-white"
            style={{ height: getPreviewHeightForResult(props.result) }}
          />
        )}
      </QuestionResultLoader>
    </Box>
  );
};

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 10;
  return rowCount * 36 + 36 + 2;
}

export default NotebookStepPreview;
