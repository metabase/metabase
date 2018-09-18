import React from "react";

import { keyForColumn } from "metabase/lib/dataset";

import ChartSettingsWidget from "../ChartSettingsWidget";
import ColumnItem from "./ColumnItem";
import { getSettingsWidgetsForColumn } from "metabase/visualizations/lib/settings/column";

import Icon from "metabase/components/Icon";

import _ from "underscore";

const displayNameForColumn = column =>
  column ? column.display_name || column.name : "[Unknown]";

export default class ChartSettingColumnSettings extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      editingColumnKey:
        props.editingColumnKey ||
        (props.columns.length === 1 ? keyForColumn(props.columns[0]) : null),
    };
  }

  componentWillReceiveProps(nextProps) {
    // reset editingColumn if there's only one column
    if (
      nextProps.columns.length === 1 &&
      this.state.editingColumn !== keyForColumn(nextProps.columns[0])
    ) {
      this.setState({
        editingColumnKey: keyForColumn(nextProps.columns[0]),
      });
    }
  }

  handleChange = newSettings => {
    const { onChange } = this.props;
    const { editingColumnKey } = this.state;

    const columnsSettings = this.props.value || {};
    const columnSettings = columnsSettings[editingColumnKey] || {};
    onChange({
      ...columnsSettings,
      [editingColumnKey]: {
        ...columnSettings,
        ...newSettings,
      },
    });
  };

  handleEditColumn(column) {
    this.setState({ editingColumnKey: keyForColumn(column) });
  }

  handleEndEditing = () => {
    this.setState({ editingColumnKey: null });
    if (this.props.onEndEditing) {
      this.props.onEndEditing();
    }
  };

  render() {
    const { series, columns } = this.props;
    const { editingColumnKey } = this.state;

    const editingColumn = editingColumnKey
      ? _.find(columns, col => keyForColumn(col) === editingColumnKey)
      : null;
    if (editingColumn) {
      const columnsSettings = this.props.value || {};
      const columnSettings = columnsSettings[editingColumnKey] || {};
      return (
        <div>
          {/* only show the back button if we have more than one column */}
          {columns.length > 1 && (
            <div
              className="flex align-center mb2 cursor-pointer"
              onClick={this.handleEndEditing}
            >
              <Icon name="chevronleft" className="text-light" />
              <span className="ml1 text-bold text-brand">
                {displayNameForColumn(editingColumn)}
              </span>
            </div>
          )}
          {getSettingsWidgetsForColumn(
            series,
            editingColumn,
            columnSettings,
            this.handleChange,
          ).map(widget => (
            <ChartSettingsWidget key={`${widget.id}`} {...widget} />
          ))}
        </div>
      );
    } else {
      return (
        <div>
          {columns.map(column => (
            <ColumnItem
              title={displayNameForColumn(column)}
              onEdit={() => this.handleEditColumn(column)}
              onClick={() => this.handleEditColumn(column)}
            />
          ))}
        </div>
      );
    }
  }
}
