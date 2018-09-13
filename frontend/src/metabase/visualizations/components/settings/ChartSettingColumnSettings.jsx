import React from "react";

import { keyForColumn } from "metabase/lib/dataset";

import ChartSettingsWidget from "../ChartSettingsWidget";
import { getSettingsWidgetsForColumn } from "metabase/visualizations/lib/settings/column";

import Icon from "metabase/components/Icon";

const displayNameForColumn = column =>
  column ? column.display_name || column.name : "[Unknown]";

export default class ChartSettingColumnSettings extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      editingColumn: props.columns.length === 1 ? props.columns[0] : null,
    };
  }

  componentWillReceiveProps(nextProps) {
    // reset editingColumn if there's only one column
    if (
      nextProps.columns.length === 1 &&
      this.state.editingColumn !== nextProps.columns[0]
    ) {
      this.setState({
        editingColumn: nextProps.columns[0],
      });
    }
  }

  handleChange = newSettings => {
    const { onChange } = this.props;
    const { editingColumn } = this.state;

    const columnKey = keyForColumn(editingColumn);
    const columnsSettings = this.props.value || {};
    const columnSettings = columnsSettings[columnKey] || {};
    onChange({
      ...columnsSettings,
      [columnKey]: {
        ...columnSettings,
        ...newSettings,
      },
    });
  };

  render() {
    const { columns } = this.props;
    const { editingColumn } = this.state;

    if (editingColumn) {
      const columnKey = keyForColumn(editingColumn);
      const columnsSettings = this.props.value || {};
      const columnSettings = columnsSettings[columnKey] || {};
      return (
        <div>
          {/* only show the back button if we have more than one column */}
          {columns.length > 1 && (
            <div
              className="flex align-center mb2 cursor-pointer"
              onClick={() => this.setState({ editingColumn: null })}
            >
              <Icon name="chevronleft" className="text-light" />
              <span className="ml1 text-bold text-brand">
                {displayNameForColumn(editingColumn)}
              </span>
            </div>
          )}
          {getSettingsWidgetsForColumn(
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
            <div
              className="bordered rounded p1 mb1"
              onClick={() => this.setState({ editingColumn: column })}
            >
              {displayNameForColumn(column)}
            </div>
          ))}
        </div>
      );
    }
  }
}
