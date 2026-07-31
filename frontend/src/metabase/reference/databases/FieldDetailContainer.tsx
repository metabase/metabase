import cx from "classnames";
import type { Location } from "history";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import FieldDetail from "metabase/reference/databases/FieldDetail";
import * as actions from "metabase/reference/reference";
import { getMetadata } from "metabase/selectors/metadata";

import type { ClearStateProps, FetchProps } from "../reference";
import type {
  ReferenceRouteParams,
  ReferenceRouteProps,
  StateWithReference,
} from "../selectors";
import {
  getDatabase,
  getField,
  getIsEditing,
  getTable,
  getTableId,
} from "../selectors";
import type { StubbedDatabase, StubbedField, StubbedTable } from "../types";

import FieldSidebar from "./FieldSidebar";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  field: getField(state, props),
  tableId: getTableId(state, props),
  isEditing: getIsEditing(state),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  fetchTableMetadataAndForeignKeys,
  ...actions,
};

interface FieldDetailContainerProps extends FetchProps, ClearStateProps {
  // From React Router
  params: ReferenceRouteParams;
  location: Location;

  // From route definition / parent
  style: React.CSSProperties;

  // From mapStateToProps
  database: StubbedDatabase;
  tableId: number;
  table: StubbedTable;
  field: StubbedField;
  isEditing?: boolean;

  // From mapDispatchToProps
  fetchTableMetadataAndForeignKeys: (args: { id: number }) => Promise<unknown>;
}

class FieldDetailContainer extends Component<FieldDetailContainerProps> {
  fetchContainerData() {
    actions.wrappedFetchTableMetadata(this.props, this.props.tableId);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: FieldDetailContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { database, table, field, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={
          <FieldSidebar database={database} table={table} field={field} />
        }
      >
        <FieldDetail {...this.props} />
      </SidebarLayout>
    );
  }
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(FieldDetailContainer as unknown as React.ComponentType);
