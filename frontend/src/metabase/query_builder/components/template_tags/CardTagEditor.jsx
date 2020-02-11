import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import Card from "metabase/components/Card";
import QuestionPicker from "metabase/containers/QuestionPicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/components/SelectButton";

import Questions from "metabase/entities/questions";
import { question as questionUrl } from "metabase/lib/urls";

export default class CardTagEditor extends Component {
  render() {
    const id = this.props.tag.card;

    return (
      <Card className="p2 mb2">
        <h3 className="text-brand pb1">
          <Link to={questionUrl(id)}>{t`Question #${id}`}</Link>
        </h3>
        <CardSelector {...this.props} id={id} />
      </Card>
    );
  }
}

@Questions.load({ id: (state, props) => props.id, wrapped: true })
class CardSelector extends Component {
  handleQuestionSelection = id => {
    const { question, query, setDatasetQuery } = this.props;
    setDatasetQuery(query.replaceCardId(question.id, id).datasetQuery());
    this._popover && this._popover.close();
  };

  hasMismatchedDatabases = () => {
    const { question, query } = this.props;
    return question.database_id !== query.databaseId();
  };

  render() {
    const { question } = this.props;

    return (
      <div>
        <PopoverWithTrigger
          ref={ref => (this._popover = ref)}
          triggerElement={<SelectButton>{question.getName()}</SelectButton>}
          verticalAttachments={["top", "bottom"]}
          pinInitialAttachment
        >
          <QuestionPicker
            className="p2"
            value={question.id}
            onChange={this.handleQuestionSelection}
          />
        </PopoverWithTrigger>
        {this.hasMismatchedDatabases() && (
          <p className="text-error">
            {t`This question is from a different database.`}
          </p>
        )}
      </div>
    );
  }
}
