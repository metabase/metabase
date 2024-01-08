/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";

import cx from "classnames";
import _ from "underscore";

import { Motion, spring } from "react-motion";
import { isReducedMotionPreferred } from "metabase/lib/dom";

import { Icon } from "metabase/core/components/Icon";
import Button from "metabase/core/components/Button";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import {
  PreviewButtonContainer,
  PreviewHeader,
  PreviewIconContainer,
  PreviewRoot,
} from "./NotebookStepPreview.styled";

const PREVIEW_ROWS_LIMIT = 10;

class NotebookStepPreview extends Component {
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
    const { previewQuery: query, stageIndex } = step;
    const limit = Lib.currentLimit(query, stageIndex);
    const hasSuitableLimit = limit !== null && limit <= PREVIEW_ROWS_LIMIT;
    const queryWithLimit = hasSuitableLimit
      ? query
      : Lib.limit(query, stageIndex, PREVIEW_ROWS_LIMIT);

    return Question.create()
      ._setMLv2Query(queryWithLimit)
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

    const preferReducedMotion = isReducedMotionPreferred();
    const springOpts = preferReducedMotion
      ? { stiffness: 500 }
      : { stiffness: 170 };

    return (
      <PreviewRoot data-testid="preview-root">
        <PreviewHeader>
          <span className="text-bold">{t`Preview`}</span>
          <PreviewIconContainer>
            <Icon
              name="close"
              onClick={onClose}
              className="text-light text-medium-hover cursor-pointer ml1"
            />
          </PreviewIconContainer>
        </PreviewHeader>
        {isDirty ? (
          <PreviewButtonContainer className="bordered shadowed rounded bg-white p4">
            <Button onClick={this.refresh}>{t`Refresh`}</Button>
          </PreviewButtonContainer>
        ) : (
          <QuestionResultLoader question={question}>
            {({ rawSeries, result }) => (
              <Motion
                defaultStyle={{ height: 36 }}
                style={{
                  height: spring(getPreviewHeightForResult(result), springOpts),
                }}
              >
                {({ height }) => {
                  const targetHeight = getPreviewHeightForResult(result);
                  const snapHeight =
                    height > targetHeight / 2 ? targetHeight : 0;
                  const minHeight = preferReducedMotion ? snapHeight : height;
                  return (
                    <Visualization
                      rawSeries={rawSeries}
                      error={result && result.error}
                      className={cx("bordered shadowed rounded bg-white", {
                        p2: result && result.error,
                      })}
                      style={{ minHeight }}
                    />
                  );
                }}
              </Motion>
            )}
          </QuestionResultLoader>
        )}
      </PreviewRoot>
    );
  }
}

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * 36 + 36 + 2;
}

export default NotebookStepPreview;
