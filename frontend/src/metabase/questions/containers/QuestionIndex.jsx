import React, { Component } from "react";
import { connect } from "react-redux";
import EntityList from "metabase/questions/containers/EntityList.jsx";

import { getLoadingInitialEntities, getAllEntities } from "../selectors";

import { getUserIsAdmin } from "metabase/selectors/user";

import { replace } from "react-router-redux";

const mapStateToProps = (state, props) => ({
  loading: getLoadingInitialEntities(state, props),
  questions: getAllEntities(state, props),
  isAdmin: getUserIsAdmin(state, props),
});

/* connect() is in the end of this file because of the plain QuestionIndex component is used in Jest tests */
export class QuestionIndex extends Component {
  render() {
    return (
      <EntityList
        entityType="cards"
        entityQuery={{ f: "all", collection: "", ...location.query }}
        // use replace when changing sections so back button still takes you back to collections page
        onChangeSection={section =>
          replace({
            ...location,
            query: { ...location.query, f: section },
          })
        }
      />
    );
  }
}

export default connect(mapStateToProps)(QuestionIndex);
