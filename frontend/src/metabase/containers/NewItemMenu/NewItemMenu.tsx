import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import NewItemMenu from "metabase/components/NewItemMenu";
import Databases from "metabase/entities/databases";
import { closeNavbar } from "metabase/redux/app";
import {
  getHasDataAccess,
  getHasDatabaseWithActionsEnabled,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";
import type Database from "metabase-lib/v1/metadata/Database";
import type { CollectionItem } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface MenuDatabaseProps {
  databases?: Database[];
  models?: CollectionItem[];
}

const mapStateToProps = (
  state: State,
  { databases = [], models = [] }: MenuDatabaseProps,
) => ({
  hasModels: models.length > 0,
  hasDataAccess: getHasDataAccess(databases),
  hasNativeWrite: getHasNativeWrite(databases),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(databases),
  hasDatabaseWithActionsEnabled: getHasDatabaseWithActionsEnabled(databases),
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
