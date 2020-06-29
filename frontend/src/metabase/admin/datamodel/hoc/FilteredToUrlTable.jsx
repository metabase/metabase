import React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

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
          query: { table: tableId },
        });
      };

      render() {
        const { [propName]: items, otherProps } = this.props;
        const { tableId } = this.state;
        const props = {
          [propName]: items.filter(item => item.table_id === tableId),
          tableId,
          setTableId: this.setTableId,
          ...otherProps,
        };
        return <ComposedComponent {...props} />;
      }
    },
  );

export default FilteredToUrlTable;
