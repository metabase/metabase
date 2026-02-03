import { push } from "react-router-redux";
import _ from "underscore";

import { Databases } from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { getHasDatabaseWithJsonEngine } from "metabase/selectors/data";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type { State } from "metabase-types/store";

import { NewItemMenuView } from "./NewItemMenuView";

interface MenuDatabaseProps {
  databases?: Database[];
}

const mapStateToProps = (
  state: State,
  { databases = [] }: MenuDatabaseProps,
) => ({
  hasDataAccess: canUserCreateQueries(state),
  hasNativeWrite: canUserCreateNativeQueries(state),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(databases),
});

const mapDispatchToProps = {
  onCloseNavbar: closeNavbar,
  onChangeLocation: push,
};

export const NewItemMenu = _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(NewItemMenuView);
