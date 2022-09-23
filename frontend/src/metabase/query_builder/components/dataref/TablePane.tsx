// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Expandable from "metabase/components/Expandable";
import Tables from "metabase/entities/tables";

import {
  Description,
  EmptyDescription,
  LoadingSpinner,
  AbsoluteContainer,
  Fade,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import {
  InfoContainer,
  MetadataContainer,
} from "metabase/components/MetadataInfo/TableInfo/TableInfo.styled";
import ConnectedTables from "metabase/components/MetadataInfo/TableInfo/ConnectedTables";
import ConnectedTableList from "metabase/query_builder/components/dataref/ConnectedTableList";
// import { showAddParameterPopover } from "metabase/dashboard/actions";
import Table from "metabase-lib/lib/metadata/Table";
import FieldList from "./FieldList";

type OwnProps = {
  className?: string;
  table: Table;
  onConnectedTableClick?: (table: Table) => void;
};

const mapStateToProps = (state: any, props: OwnProps): { table?: Table } => ({
  tableId: props.table.id,
  table: Tables.selectors.getObject(state, {
    entityId: props.table.id,
  }),
});

const mapDispatchToProps: {
  fetchForeignKeys: (args: { id: Table["id"] }) => Promise<any>;
  fetchMetadata: (args: { id: Table["id"] }) => Promise<any>;
} = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

const propTypes = {
  query: PropTypes.object.isRequired,
  show: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  setCardAndRun: PropTypes.func.isRequired,
  tableId: PropTypes.number.isRequired,
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
        this.props.fetchForeignKeys({ id: this.props.tableId }),
        this.props.fetchMetadata({ id: this.props.tableId }),
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
    const { table } = this.props;
    const { error, hasFetchedMetadata } = this.state;
    if (table) {
      return (
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
                handleFieldClick={field => this.props.show("field", field)}
              />
            )}
            <MetadataContainer>
              <Fade visible={!hasFetchedMetadata}>
                <AbsoluteContainer>
                  <LoadingSpinner size={24} />
                </AbsoluteContainer>
              </Fade>
              <Fade visible={hasFetchedMetadata}>
                {table && (
                  <ConnectedTableList
                    tables={table.connectedTables()}
                    onTableClick={t => this.props.show("table", t)}
                  />
                )}
              </Fade>
            </MetadataContainer>
          </div>
        </div>
      );
    } else {
      return <div>{error}</div>;
    }
  }
}

TablePane.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(TablePane);

const ExpandableItemList = Expandable(
  ({ name, type, show, items, isExpanded, onExpand }) => (
    <div className="mb2">
      <div className="text-bold mb1">{name}</div>
      <ul>
        {items.map((item, index) => (
          <ListItem key={item.id} onClick={() => show(item)}>
            {item.name}
          </ListItem>
        ))}
        {!isExpanded && <ListItem onClick={onExpand}>{t`More`}...</ListItem>}
      </ul>
    </div>
  ),
);

ExpandableItemList.propTypes = {
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  show: PropTypes.func.isRequired,
  items: PropTypes.array.isRequired,
  onExpand: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
};

const ListItem = ({ onClick, children }) => (
  <li className="py1 border-row-divider">
    <a className="text-brand no-decoration" onClick={onClick}>
      {children}
    </a>
  </li>
);

ListItem.propTypes = {
  children: PropTypes.any,
  onClick: PropTypes.func,
};
