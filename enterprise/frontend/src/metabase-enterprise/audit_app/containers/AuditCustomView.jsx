/* eslint-disable react/prop-types */
import { Component } from "react";

import "./AuditTableVisualization";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

class AuditTable extends Component {
  render() {
    const { metadata, card } = this.props;
    const question = new Question(card.card, metadata);

    return (
      <QuestionResultLoader className="mt3" question={question}>
        {this.props.children}
      </QuestionResultLoader>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(AuditTable);
