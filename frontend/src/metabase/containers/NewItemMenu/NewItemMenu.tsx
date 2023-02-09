import { connect } from "react-redux";
import _ from "underscore";
import { closeNavbar } from "metabase/redux/app";
import NewItemMenu from "metabase/components/NewItemMenu";
import Databases from "metabase/entities/databases";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";
import { Database } from "metabase-types/api";
import { State } from "metabase-types/store";

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
};

export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(NewItemMenu);
