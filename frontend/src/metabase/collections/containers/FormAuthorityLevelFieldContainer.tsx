import { connect } from "react-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface OwnProps {
  collectionParentId: Collection["id"];
}

interface StateProps {
  isAdmin: boolean;
}

type FormAuthorityLevelFieldContainerProps = OwnProps & StateProps;

function mapStateToProps(state: State): StateProps {
  return {
    isAdmin: getUserIsAdmin(state),
  };
}

function FormAuthorityLevelFieldContainer({
  isAdmin,
}: FormAuthorityLevelFieldContainerProps) {
  if (!isAdmin) {
    return null;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.FormCollectionAuthorityLevelPicker name="authority_level" />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  // Ensures there's data for the `collectionsMap` prop
  Collections.loadList({ loadingAndErrorWrapper: false }),
  connect(mapStateToProps),
)(FormAuthorityLevelFieldContainer);
