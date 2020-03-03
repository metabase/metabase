import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Card from "metabase/components/Card";
import QuestionPicker from "metabase/containers/QuestionPicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/components/SelectButton";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import Questions from "metabase/entities/questions";
import { question as questionUrl } from "metabase/lib/urls";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";

@Questions.load({
  id: (state, { tag }) => tag.card_id,
  loadingAndErrorWrapper: false,
})
export default class CardTagEditor extends Component {
  handleQuestionSelection = id => {
    const { question, query, setDatasetQuery } = this.props;
    setDatasetQuery(
      query.replaceCardId(question ? question.id : "", id).datasetQuery(),
    );
    this._popover && this._popover.close();
  };

  errorMessage() {
    const { error, question, query } = this.props;

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
      return error.status === 404
        ? t`Couldn't find a saved question with that ID number.`
        : error.data;
    }
    return null;
  }

  triggerElement() {
    const { tag, question } = this.props;
    return (
      <SelectButton>
        {tag.card_id == null ? (
          <span className="text-medium">{t`Pick a saved question`}</span>
        ) : this.errorMessage() ? (
          <span className="text-medium">{t`Pick a different question`}</span>
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
      tag: { card_id },
      loading,
      question,
    } = this.props;

    return (
      <Card className="p2 mb2">
        <h3 className="text-brand mb2">
          {card_id == null ? (
            t`Question #…`
          ) : (
            <Link to={questionUrl(card_id)}>{t`Question #${card_id}`}</Link>
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
          <div className="bg-light text-medium py1 px2 mt2">
            {question.collection && (
              <div className="flex align-center">
                <Icon name="all" size={12} mr={1} /> {question.collection.name}
              </div>
            )}
            <div className="flex align-center">
              <Icon name="calendar" size={12} mr={1} />{" "}
              {t`Last edited ${formatDate(question.updated_at)}`}
            </div>
          </div>
        )}
      </Card>
    );
  }
}

// This formats a timestamp as a date using any custom formatting options.
function formatDate(value) {
  const options = MetabaseSettings.get("custom-formatting")["type/Temporal"];
  return formatDateTimeWithUnit(value, "day", options);
}
