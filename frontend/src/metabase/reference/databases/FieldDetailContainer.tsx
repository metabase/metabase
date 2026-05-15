import cx from "classnames";
import { Component } from "react";

import { SidebarLayout } from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import FieldDetail from "metabase/reference/databases/FieldDetail";
import * as actions from "metabase/reference/reference";
import { getMetadata } from "metabase/selectors/metadata";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getDatabase,
  getDatabaseId,
  getField,
  getIsEditing,
  getTable,
} from "../selectors";

import FieldSidebar from "./FieldSidebar";

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  database: getDatabase(state, props),
  table: getTable(state, props),
  field: getField(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

interface FieldDetailContainerProps {
  location: { pathname: string };

  database: any;
  databaseId: number;

  table: any;

  field: any;
  isEditing?: boolean;
}

class FieldDetailContainer extends Component<FieldDetailContainerProps> {
  async fetchContainerData() {
    await actions.wrappedFetchDatabaseMetadata(
      this.props as any,
      this.props.databaseId,
    );
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps: FieldDetailContainerProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps as any);
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
        {}
        <FieldDetail {...(this.props as any)} />
      </SidebarLayout>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(FieldDetailContainer as unknown as React.ComponentType);
