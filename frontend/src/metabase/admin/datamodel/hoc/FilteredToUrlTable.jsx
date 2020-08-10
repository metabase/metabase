import React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import cx from "classnames";
import { t } from "ttag";

import Tables from "metabase/entities/tables";
import Icon from "metabase/components/Icon";
import FieldSet from "metabase/components/FieldSet";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

const FilteredToUrlTable = propName => ComposedComponent =>
  connect(
    null,
    { push },
  )(
    class FilteredToUrlTable extends React.Component {
      constructor(props) {
        super(props);
        const { table } = props.location.query || {};
        this.state = { tableId: table != null ? parseInt(table) : null };
      }

      setTableId = tableId => {
        this.setState({ tableId });
        this.props.push({
          ...this.props.location,
          query: tableId == null ? {} : { table: tableId },
        });
      };

      render() {
        const { [propName]: items, otherProps } = this.props;
        const { tableId } = this.state;
        const props = {
          [propName]:
            tableId == null
              ? items
              : items.filter(item => item.table_id === tableId),
          tableSelector: (
            <TableSelector tableId={tableId} setTableId={this.setTableId} />
          ),
          ...otherProps,
        };
        return <ComposedComponent {...props} />;
      }
    },
  );

export default FilteredToUrlTable;

@Tables.load({
  id: (state, props) => props.tableId,
  loadingAndErrorWrapper: false,
})
class TableSelector extends React.Component {
  render() {
    const { table, tableId, setTableId } = this.props;
    return (
      <FieldSet
        noPadding
        className={cx("p0", { "border-brand": tableId != null })}
      >
        <div className="p2" style={{ width: 200 }}>
          <DatabaseSchemaAndTableDataSelector
            selectedTableId={tableId}
            setSourceTableFn={setTableId}
            triggerElement={
              tableId == null ? (
                <span className="flex align-center justify-between flex-full text-medium text-bold">
                  {t`Filter by table`}
                  <Icon name="chevrondown" size={12} />
                </span>
              ) : (
                <span className="flex align-center justify-between flex-full text-brand text-bold">
                  {table && table.displayName()}
                  <Icon
                    name="close"
                    onClick={e => {
                      e.stopPropagation();
                      setTableId(null);
                    }}
                    size={12}
                  />
                </span>
              )
            }
          />
        </div>
      </FieldSet>
    );
  }
}
