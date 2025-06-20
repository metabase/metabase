import { push } from "react-router-redux";
import _ from "underscore";

import NewItemMenu from "metabase/components/NewItemMenu";
import Databases from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";
import type Database from "metabase-lib/v1/metadata/Database";
import type { State } from "metabase-types/store";

interface MenuDatabaseProps {
  databases?: Database[];
}

const mapStateToProps = (
  state: State,
  { databases = [] }: MenuDatabaseProps,
) => ({
  hasDataAccess: getHasDataAccess(databases),
  hasNativeWrite: getHasNativeWrite(databases),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(databases),
});

const mapDispatchToProps = {
  onCloseNavbar: closeNavbar,
  onChangeLocation: push,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(NewItemMenu);
