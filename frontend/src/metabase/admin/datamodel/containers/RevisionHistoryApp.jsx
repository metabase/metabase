import React, { Component } from "react";
import { connect } from "react-redux";

import RevisionHistory from "../components/revisions/RevisionHistory.jsx";

import { revisionHistorySelectors } from "../selectors";
import * as actions from "../datamodel";

const mapStateToProps = (state, props) => {
  return {
    ...revisionHistorySelectors(state, props),
    entity: props.params.entity,
    id: props.params.id,
  };
};

const mapDispatchToProps = {
  ...actions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class RevisionHistoryApp extends Component {
  componentWillMount() {
    let { entity, id } = this.props;

    this.props.fetchRevisions({ entity, id });
  }
  render() {
    return <RevisionHistory {...this.props} objectType={this.props.entity} />;
  }
}
