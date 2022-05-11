import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Expandable from "metabase/components/Expandable";
import { TableInfo } from "./TablePane.styled";
import Table from "metabase/entities/tables";

const mapStateToProps = (state, ownProps) => ({
  tableId: ownProps.table.id,
  table: Table.selectors.getObject(state, { entityId: ownProps.table.id }),
});

const mapDispatchToProps = {
  fetchForeignKeys: Table.actions.fetchForeignKeys,
  fetchMetadata: Table.actions.fetchMetadata,
};

class TablePane extends React.Component {
  state = {
    error: null,
  };

  static propTypes = {
    query: PropTypes.object.isRequired,
    show: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    tableId: PropTypes.number.isRequired,
    table: PropTypes.object,
    fetchForeignKeys: PropTypes.func.isRequired,
    fetchMetadata: PropTypes.func.isRequired,
  };

  async UNSAFE_componentWillMount() {
    try {
      await Promise.all([
        this.props.fetchForeignKeys({ id: this.props.tableId }),
        this.props.fetchMetadata({ id: this.props.tableId }),
      ]);
    } catch (e) {
      this.setState({
        error: t`An error occurred loading the table`,
      });
    }
  }

  render() {
    const { table } = this.props;
    const { error } = this.state;
    if (table) {
      return (
        <div>
          <div className="ml1">
            <div className="flex align-center">
              <Icon name="table2" className="text-medium pr1" size={16} />
              <h3 className="text-wrap">{table.name}</h3>
            </div>
            <TableInfo
              tableId={table.id}
              onConnectedTableClick={table => this.props.show("table", table)}
            />
            <div className="my2 text-uppercase">
              {
                <ul>
                  {table.fields.map((item, index) => (
                    <li key={item.id}>
                      <a
                        onClick={() => this.props.show("field", item)}
                        className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              }
            </div>
          </div>
        </div>
      );
    } else {
      return <div>{error}</div>;
    }
  }
}

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
