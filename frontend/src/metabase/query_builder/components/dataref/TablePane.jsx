/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import cx from "classnames";

// components
import Icon from "metabase/components/Icon";
import Expandable from "metabase/components/Expandable";

// lib
import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";
import { inflect } from "metabase/lib/formatting";

// entities
import Table from "metabase/entities/tables";

const mapStateToProps = (state, ownProps) => ({
  tableId: ownProps.table.id,
  table: Table.selectors.getObject(state, { entityId: ownProps.table.id }),
});

const mapDispatchToProps = {
  fetchForeignKeys: Table.actions.fetchForeignKeys,
  fetchMetadata: Table.actions.fetchMetadata,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class TablePane extends React.Component {
  state = {
    pane: "fields",
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

  async componentWillMount() {
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

  showPane = name => {
    this.setState({ pane: name });
  };

  render() {
    const { table } = this.props;
    const { pane, error } = this.state;
    if (table) {
      const fks = table.fks || [];
      const panes = {
        fields: table.fields.length,
        // "metrics": table.metrics.length,
        // "segments": table.segments.length,
        connections: fks.length,
      };
      const tabs = Object.entries(panes).map(([name, count]) => (
        <a
          key={name}
          className={cx("Button Button--small", {
            "Button--active": name === pane,
          })}
          onClick={this.showPane.bind(null, name)}
        >
          <span className="DataReference-paneCount">{count}</span>
          <span>{inflect(name, count)}</span>
        </a>
      ));

      const descriptionClasses = cx({ "text-medium": !table.description });
      const description = (
        <p className={"text-spaced " + descriptionClasses}>
          {table.description || t`No description set.`}
        </p>
      );
      let content;
      if (pane === "connections") {
        const fkCountsByTable = foreignKeyCountsByOriginTable(fks);
        content = (
          <ul>
            {fks
              .sort((a, b) =>
                a.origin.table.display_name.localeCompare(
                  b.origin.table.display_name,
                ),
              )
              .map((fk, index) => (
                <li>
                  <a
                    key={fk.id}
                    onClick={() => this.props.show("field", fk.origin)}
                    className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                  >
                    {fk.origin.table.display_name}
                    {fkCountsByTable[fk.origin.table.id] > 1 ? (
                      <span className="text-medium text-light h5">
                        {" "}
                        via {fk.origin.display_name}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
          </ul>
        );
      } else if (pane) {
        const itemType = pane.replace(/s$/, "");
        content = (
          <ul>
            {table[pane].map((item, index) => (
              <li>
                <a
                  key={item.id}
                  onClick={() => this.props.show(itemType, item)}
                  className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        );
      }

      return (
        <div>
          <div className="ml1">
            <div className="flex align-center">
              <Icon name="table2" className="text-medium pr1" size={16} />
              <h3 className="text-wrap">{table.name}</h3>
            </div>
            {description}
            <div className="my2 Button-group Button-group--brand text-uppercase">
              {tabs}
            </div>
          </div>
          {content}
        </div>
      );
    } else {
      return <div>{error}</div>;
    }
  }
}

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
