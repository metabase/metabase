import React from "react";

import cx from "classnames";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import { Box, Flex } from "grid-styled";
import { Motion, spring } from "react-motion";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import Question from "metabase-lib/lib/Question";

class NotebookStepPreview extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      question: this.getPreviewQuestion(props.step),
    };
  }

  refresh = () => {
    this.setState({
      question: this.getPreviewQuestion(this.props.step),
    });
  };

  getPreviewQuestion(step) {
    const query = step.previewQuery;
    return Question.create()
      .setQuery(query.limit() < 10 ? query : query.updateLimit(10))
      .setDisplay("table")
      .setSettings({ "table.pivot": false });
  }

  getIsDirty() {
    const newQuestion = this.getPreviewQuestion(this.props.step);
    return !_.isEqual(newQuestion.card(), this.state.question.card());
  }

  render() {
    const { onClose } = this.props;
    const { question } = this.state;

    const isDirty = this.getIsDirty();

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
        {isDirty ? (
          <Flex
            align="center"
            justify="center"
            className="bordered shadowed rounded bg-white p4"
          >
            <Button onClick={this.refresh}>Refresh</Button>
          </Flex>
        ) : (
          <QuestionResultLoader question={question}>
            {({ rawSeries, result }) => (
              <Motion
                defaultStyle={{ height: 36 }}
                style={{ height: spring(getPreviewHeightForResult(result)) }}
              >
                {({ height }) => (
                  <Visualization
                    rawSeries={rawSeries}
                    error={result && result.error}
                    className={cx("bordered shadowed rounded bg-white", {
                      p2: result && result.error,
                    })}
                    style={{ minHeight: height }}
                  />
                )}
              </Motion>
            )}
          </QuestionResultLoader>
        )}
      </Box>
    );
  }
}

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * 36 + 36 + 2;
}

export default NotebookStepPreview;
