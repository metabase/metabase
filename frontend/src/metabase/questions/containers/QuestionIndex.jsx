import React, { Component } from "react";
import { connect } from "react-redux";

import { getLoadingInitialEntities, getAllEntities } from "../selectors";

import { getUserIsAdmin } from "metabase/selectors/user";

const mapStateToProps = (state, props) => ({
  loading: getLoadingInitialEntities(state, props),
  questions: getAllEntities(state, props),
  isAdmin: getUserIsAdmin(state, props),
});

/* connect() is in the end of this file because of the plain QuestionIndex component is used in Jest tests */
export class QuestionIndex extends Component {
  render() {
    return <div />;
  }
}

export default connect(mapStateToProps)(QuestionIndex);
