import React from "react";

import Icon from "metabase/components/Icon";
import { Box, Flex } from "grid-styled";
import { Motion, spring } from "react-motion";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import Question from "metabase-lib/lib/Question";

const NotebookStepPreview = ({ step, onClose, ...props }) => {
  const query = step.previewQuery;
  const question = Question.create().setQuery(
    query.limit() < 10 ? query : query.updateLimit(10),
  );
  return (
    <Box pt={2}>
      <Flex align="center" justify="space-between" mb={1}>
        <span className="text-bold">{`Preview`}</span>
        <Flex align="right">
          <Icon
            name="close"
            onClick={onClose}
            className="text-light text-medium-hover cursor-pointer ml1"
           />
        </Flex>
      </Flex>
      <QuestionResultLoader question={question}>
        {props => (
          <Motion
            defaultStyle={{ height: 36 }}
            style={{ height: spring(getPreviewHeightForResult(props.result)) }}
          >
            {({ height }) => (
              <Visualization
                {...props}
                className="bordered shadowed rounded bg-white"
                style={{ height }}
              />
            )}
          </Motion>
        )}
      </QuestionResultLoader>
    </Box>
  );
};

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * 36 + 36 + 2;
}

export default NotebookStepPreview;
