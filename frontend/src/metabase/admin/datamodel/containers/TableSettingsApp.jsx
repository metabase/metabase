import React, { Component } from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { BackButton } from "metabase/admin/datamodel/containers/FieldApp";
import ActionButton from "metabase/components/ActionButton";
import Section, { SectionHeader } from "../components/Section";

import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";

import { rescanTableFieldValues, discardTableFieldValues } from "../table";

const mapStateToProps = (state, { params: { databaseId, tableId } }) => ({
  databaseId: parseInt(databaseId),
  tableId: parseInt(tableId),
});

const mapDispatchToProps = {
  rescanTableFieldValues,
  discardTableFieldValues,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class TableSettingsApp extends Component {
  render() {
    const { tableId } = this.props;
    return (
      <div className="relative">
        <div className="wrapper wrapper--trim">
          <Nav databaseId={this.props.databaseId} tableId={tableId} />
          <UpdateFieldValues
            rescanTableFieldValues={() =>
              this.props.rescanTableFieldValues(tableId)
            }
            discardTableFieldValues={() =>
              this.props.discardTableFieldValues(tableId)
            }
          />
        </div>
      </div>
    );
  }
}

@Databases.load({ id: (state, { databaseId }) => databaseId })
@Tables.load({
  id: (state, { tableId }) => tableId,
  selectorName: "getObjectUnfiltered",
})
class Nav extends Component {
  render() {
    const { database: db, table } = this.props;
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
