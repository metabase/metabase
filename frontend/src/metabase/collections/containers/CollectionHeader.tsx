import _ from "underscore";
import { connect } from "react-redux";

import { State } from "metabase-types/store";
import Databases from "metabase/entities/databases";
import { getHasDataAccess } from "metabase/new_query/selectors";
import CollectionHeader from "../components/CollectionHeader/CollectionHeader";

const mapStateToProps = (state: State) => ({
  canCreateQuestions: getHasDataAccess(state),
});

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(CollectionHeader);
