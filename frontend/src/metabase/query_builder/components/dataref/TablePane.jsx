/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";

// components
import QueryButton from "metabase/components/QueryButton.jsx";
import Expandable from "metabase/components/Expandable.jsx";

// lib
import { createCard } from "metabase/lib/card";
import { createQuery } from "metabase/lib/query";
import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";
import { inflect } from "metabase/lib/formatting";

export default class TablePane extends Component {
  constructor(props, context) {
    super(props, context);
    this.setQueryAllRows = this.setQueryAllRows.bind(this);
    this.showPane = this.showPane.bind(this);

    this.state = {
      table: undefined,
      tableForeignKeys: undefined,
      pane: "fields",
    };
  }

  static propTypes = {
    query: PropTypes.object.isRequired,
    loadTableAndForeignKeysFn: PropTypes.func.isRequired,
    show: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    table: PropTypes.object,
  };

  componentWillMount() {
    this.props
      .loadTableAndForeignKeysFn(this.props.table.id)
      .then(result => {
        this.setState({
          table: result.table,
          tableForeignKeys: result.foreignKeys,
        });
      })
      .catch(error => {
        this.setState({
          error: t`An error occurred loading the table`,
        });
      });
  }

  showPane(name) {
    this.setState({ pane: name });
  }

  setQueryAllRows() {
    let card = createCard();
    card.dataset_query = createQuery(
      "query",
      this.state.table.db_id,
      this.state.table.id,
    );
    this.props.setCardAndRun(card);
  }

  render() {
    const { table, error } = this.state;
    if (table) {
      let queryButton;
      if (table.rows != null) {
        let text = t`See the raw data for ${table.display_name}`;
        queryButton = (
          <QueryButton
            className="border-bottom border-top mb3"
            icon="table"
            text={text}
            onClick={this.setQueryAllRows}
          />
        );
      }
      let panes = {
        fields: table.fields.length,
        // "metrics": table.metrics.length,
        // "segments": table.segments.length,
        connections: this.state.tableForeignKeys.length,
      };
      let tabs = Object.entries(panes).map(([name, count]) => (
        <a
          key={name}
          className={cx("Button Button--small", {
            "Button--active": name === this.state.pane,
          })}
          onClick={this.showPane.bind(null, name)}
        >
          <span className="DataReference-paneCount">{count}</span>
          <span>{inflect(name, count)}</span>
        </a>
      ));

      let pane;
      let description;
      if (this.state.pane === "connections") {
        const fkCountsByTable = foreignKeyCountsByOriginTable(
          this.state.tableForeignKeys,
        );
        pane = (
          <ul>
            {this.state.tableForeignKeys
              .sort((a, b) =>
                a.origin.table.display_name.localeCompare(
                  b.origin.table.display_name,
                ),
              )
              .map((fk, index) => (
                <ListItem
                  key={fk.id}
                  onClick={() => this.props.show("field", fk.origin)}
                >
                  {fk.origin.table.display_name}
                  {fkCountsByTable[fk.origin.table.id] > 1 ? (
                    <span className="text-grey-3 text-light h5">
                      {" "}
                      via {fk.origin.display_name}
                    </span>
                  ) : null}
                </ListItem>
              ))}
          </ul>
        );
      } else if (this.state.pane) {
        const itemType = this.state.pane.replace(/s$/, "");
        pane = (
          <ul>
            {table[this.state.pane].map((item, index) => (
              <ListItem
                key={item.id}
                onClick={() => this.props.show(itemType, item)}
              >
                {item.display_name || item.name}
              </ListItem>
            ))}
          </ul>
        );
      } else {
        const descriptionClasses = cx({ "text-grey-3": !table.description });
        description = (
          <p className={descriptionClasses}>
            {table.description || t`No description set.`}
          </p>
        );
      }

      return (
        <div>
          <h1>{table.display_name}</h1>
          {description}
          {queryButton}
          {table.metrics &&
            table.metrics.length > 0 && (
              <ExpandableItemList
                name="Metrics"
                type="metrics"
                show={this.props.show.bind(null, "metric")}
                items={table.metrics.filter(
                  metric => metric.archived === false,
                )}
              />
            )}
          {table.segments &&
            table.segments.length > 0 && (
              <ExpandableItemList
                name="Segments"
                type="segments"
                show={this.props.show.bind(null, "segment")}
                items={table.segments.filter(
                  segment => segment.archived === false,
                )}
              />
            )}
          <div className="Button-group Button-group--brand text-uppercase">
            {tabs}
          </div>
          {pane}
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
    <a
      className="text-brand text-brand-darken-hover no-decoration"
      onClick={onClick}
    >
      {children}
    </a>
  </li>
);

ListItem.propTypes = {
  children: PropTypes.any,
  onClick: PropTypes.func,
};
