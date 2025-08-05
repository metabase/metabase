import { push } from "react-router-redux";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";
import { getUserIsAdmin } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type { State } from "metabase-types/store";

import NewItemMenuView from "./NewItemMenuView";

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
  isAdmin: getUserIsAdmin(state),
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
)(NewItemMenuView);
