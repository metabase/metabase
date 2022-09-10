/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import QuestionPicker from "metabase/containers/QuestionPicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/core/components/SelectButton";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import Questions from "metabase/entities/questions";
import * as Urls from "metabase/lib/urls";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";

class CardTagEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { question: null, error: null };
  }

  componentDidMount() {
    this.fetchCard();
  }

  componentDidUpdate(prevProps) {
    if (this.props.tag["card-id"] !== prevProps.tag["card-id"]) {
      this.fetchCard();
    }
  }

  fetchCard() {
    this.setState({ question: null, error: null });

    if (typeof this.props.tag["card-id"] === "number") {
      Questions.api
        .getWithoutEmitter({ id: this.props.tag["card-id"] })
        .then(question => {
          this.setState({ question });
        })
        .catch(err => {
          this.setState({ error: err });
        });
    }
  }

  handleQuestionSelection = id => {
    const { query, setDatasetQuery } = this.props;
    const { question } = this.state;
    setDatasetQuery(
      query.replaceCardId(question ? question.id : "", id).datasetQuery(),
    );
    this._popover && this._popover.close();
  };

  getQuestionUrl() {
    const { tag } = this.props;
    const { question } = this.state;
    return Urls.question(question || { id: tag["card-id"] });
  }

  errorMessage() {
    const { query } = this.props;
    const { question, error } = this.state;

    if (
      question &&
      // If this question was loaded by a search endpoint before fetching, it
      // might not have a database_id set yet.
      question.database_id != null &&
      question.database_id !== query.databaseId()
    ) {
      return t`This question can't be used because it's based on a different database.`;
    }
    if (error) {
      if (error.status === 404) {
        return t`Couldn't find a saved question with that ID number.`;
      }
      if (error.status === 403) {
        return t`Sorry, you don’t have permission to see that.`;
      }
      return error.data;
    }
    return null;
  }

  triggerElement() {
    const { tag } = this.props;
    const { question } = this.state;
    return (
      <SelectButton>
        {tag["card-id"] == null ? (
          <span className="text-medium">{t`Pick a question or a model`}</span>
        ) : this.errorMessage() ? (
          <span className="text-medium">{t`Pick a different question or a model`}</span>
        ) : question ? (
          question.name
        ) : (
          // we only hit this on the initial render before we fetch
          t`Loading…`
        )}
      </SelectButton>
    );
  }

  render() {
    const {
      tag: { "card-id": cardId },
      loading,
    } = this.props;
    const { question } = this.state;

    return (
      <div className="px3 py4 border-top">
        <h3 className="text-heavy text-brand mb1">
          {cardId == null ? (
            t`Question #…`
          ) : (
            <Link to={this.getQuestionUrl()}>
              {question?.dataset ? t`Model #${cardId}` : t`Question #${cardId}`}
            </Link>
          )}
        </h3>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <PopoverWithTrigger
            ref={ref => (this._popover = ref)}
            triggerElement={this.triggerElement()}
            verticalAttachments={["top", "bottom"]}
            horizontalAttachments={["right", "left"]}
            pinInitialAttachment
          >
            <QuestionPicker
              className="p2"
              value={question && question.id}
              onChange={this.handleQuestionSelection}
            />
          </PopoverWithTrigger>
        )}
        {this.errorMessage() && (
          <p className="text-error bg-light p2 mt2 mb0">
            {this.errorMessage()}
          </p>
        )}
        {question && !this.errorMessage() && (
          <div className="bg-light text-medium text-small py1 px2 mt1">
            {question.collection && (
              <div className="flex align-center">
                <Icon name="all" size={12} mr={1} /> {question.collection.name}
              </div>
            )}
            <div
              className={cx("flex align-center", { mt1: question.collection })}
            >
              <Icon name="calendar" size={12} mr={1} />{" "}
              {t`Last edited ${formatDate(question.updated_at)}`}
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default CardTagEditor;

// This formats a timestamp as a date using any custom formatting options.
function formatDate(value) {
  const options = MetabaseSettings.get("custom-formatting")["type/Temporal"];
  return formatDateTimeWithUnit(value, "day", options);
}
