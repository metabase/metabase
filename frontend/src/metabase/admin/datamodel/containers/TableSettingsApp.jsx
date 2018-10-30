import React, { Component } from "react";
import { connect } from "react-redux";

import * as metadataActions from "metabase/redux/metadata";

import { getMetadata } from "metabase/selectors/metadata";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { BackButton } from "metabase/admin/datamodel/containers/FieldApp";
import ActionButton from "metabase/components/ActionButton.jsx";
import Section, { SectionHeader } from "../components/Section";

import { rescanTableFieldValues, discardTableFieldValues } from "../table";

const mapStateToProps = (state, props) => {
  return {
    databaseId: parseInt(props.params.databaseId),
    tableId: parseInt(props.params.tableId),
    metadata: getMetadata(state),
  };
};

const mapDispatchToProps = {
  fetchDatabaseMetadata: metadataActions.fetchDatabaseMetadata,
  fetchTableMetadata: metadataActions.fetchTableMetadata,
  rescanTableFieldValues,
  discardTableFieldValues,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class TableSettingsApp extends Component {
  async componentWillMount() {
    const {
      databaseId,
      tableId,
      fetchDatabaseMetadata,
      fetchTableMetadata,
    } = this.props;

    await fetchDatabaseMetadata(databaseId);
    await fetchTableMetadata(tableId, true);
  }

  render() {
    const { metadata, databaseId, tableId } = this.props;

    const db = metadata && metadata.databases[databaseId];
    const table = metadata && metadata.tables[tableId];
    const isLoading = !table;

    return (
      <LoadingAndErrorWrapper loading={isLoading} error={null} noWrapper>
        {() => (
          <div className="relative">
            <div className="wrapper wrapper--trim">
              <Nav db={db} table={table} />
              <UpdateFieldValues
                rescanTableFieldValues={() =>
                  this.props.rescanTableFieldValues(table.id)
                }
                discardTableFieldValues={() =>
                  this.props.discardTableFieldValues(table.id)
                }
              />
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

class Nav extends Component {
  render() {
    const { db, table } = this.props;
    return (
      <div className="flex align-center my2">
        <BackButton databaseId={db.id} tableId={table.id} />
        <div className="my4 py1 ml2">
          <Breadcrumbs
            crumbs={[
              db && [db.name, `/admin/datamodel/database/${db.id}`],
              table && [
                table.display_name,
                `/admin/datamodel/database/${db.id}/table/${table.id}`,
              ],
              t`Settings`,
            ]}
          />
        </div>
      </div>
    );
  }
}

class UpdateFieldValues extends Component {
  render() {
    return (
      <Section>
        <SectionHeader
          title={t`Cached field values`}
          description={t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
        />
        <ActionButton
          className="Button mr2"
          actionFn={this.props.rescanTableFieldValues}
          normalText={t`Re-scan this table`}
          activeText={t`Starting…`}
          failedText={t`Failed to start scan`}
          successText={t`Scan triggered!`}
        />
        <ActionButton
          className="Button Button--danger"
          actionFn={this.props.discardTableFieldValues}
          normalText={t`Discard cached field values`}
          activeText={t`Starting…`}
          failedText={t`Failed to discard values`}
          successText={t`Discard triggered!`}
        />
      </Section>
    );
  }
}
