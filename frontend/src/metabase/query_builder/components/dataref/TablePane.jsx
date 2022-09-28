import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Tables from "metabase/entities/tables";

import {
  Description,
  EmptyDescription,
  LoadingSpinner,
  AbsoluteContainer,
  Fade,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import { MetadataContainer } from "metabase/components/MetadataInfo/TableInfo/TableInfo.styled";
import ConnectedTableList from "metabase/query_builder/components/dataref/ConnectedTableList";
import FieldList from "./FieldList";

const mapStateToProps = (state, props) => ({
  table: Tables.selectors.getObject(state, {
    entityId: props.table.id,
  }),
});

const mapDispatchToProps = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

const propTypes = {
  show: PropTypes.func.isRequired,
  table: PropTypes.object,
  fetchForeignKeys: PropTypes.func.isRequired,
  fetchMetadata: PropTypes.func.isRequired,
};

class TablePane extends React.Component {
  state = {
    error: null,
    hasFetchedMetadata: false,
  };

  async UNSAFE_componentWillMount() {
    try {
      await Promise.all([
        this.props.fetchForeignKeys({ id: this.props.table.id }),
        this.props.fetchMetadata({ id: this.props.table.id }),
      ]);
      this.setState({
        hasFetchedMetadata: true,
      });
    } catch (e) {
      this.setState({
        error: t`An error occurred loading the table`,
      });
    }
  }

  render() {
    const { table, show } = this.props;
    const { error, hasFetchedMetadata } = this.state;
    return table ? (
      <div>
        <div className="ml1">
          {table.description ? (
            <Description>{table.description}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </div>
        <div className="my2">
          {table.fields && (
            <FieldList
              fields={table.fields}
              handleFieldClick={f => show("field", f)}
            />
          )}
          <MetadataContainer>
            <Fade visible={!hasFetchedMetadata}>
              <AbsoluteContainer>
                <LoadingSpinner size={24} />
              </AbsoluteContainer>
            </Fade>
            <Fade visible={hasFetchedMetadata}>
              {table?.connectedTables() && (
                <ConnectedTableList
                  tables={table.connectedTables()}
                  onTableClick={t => show("table", t)}
                />
              )}
            </Fade>
          </MetadataContainer>
        </div>
      </div>
    ) : (
      <div>{error}</div>
    );
  }
}

TablePane.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(TablePane);
