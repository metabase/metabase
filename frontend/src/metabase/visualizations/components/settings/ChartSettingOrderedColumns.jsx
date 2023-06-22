/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { findColumnForColumnSetting } from "metabase-lib/queries/utils/dataset";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import ColumnItem from "./ColumnItem";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

export default class ChartSettingOrderedColumns extends Component {
  handleEnable = columnSetting => {
    const columnSettings = [...this.props.value];
    const index = columnSetting.index;
    columnSettings[index] = { ...columnSettings[index], enabled: true };
    this.props.onChange(columnSettings);
  };

  handleDisable = columnSetting => {
    const columnSettings = [...this.props.value];
    const index = columnSetting.index;
    columnSettings[index] = { ...columnSettings[index], enabled: false };
    this.props.onChange(columnSettings);
  };

  handleSortEnd = ({ oldIndex, newIndex }) => {
    const fields = [...this.props.value];
    fields.splice(newIndex, 0, fields.splice(oldIndex, 1)[0]);
    this.props.onChange(fields);
  };

  handleEdit = (columnSetting, targetElement) => {
    const column = findColumnForColumnSetting(
      this.props.columns,
      columnSetting,
    );
    if (column) {
      this.props.onShowWidget(
        {
          id: "column_settings",
          props: {
            initialKey: getColumnKey(column),
          },
        },
        targetElement,
      );
    }
  };

  handleAddNewField = fieldRef => {
    const { value, onChange } = this.props;
    const columnSettings = [...value, { fieldRef, enabled: true }];
    onChange(columnSettings);
  };

  getColumnName = columnSetting => {
    const { getColumnName } = this.props;
    return getColumnName(columnSetting) || "[Unknown]";
  };

  render() {
    const { value, question, columns } = this.props;
    const query = question && question.query();

    let additionalFieldOptions = { count: 0 };
    if (columns && query instanceof StructuredQuery) {
      additionalFieldOptions = query.fieldsOptions(dimension => {
        return !_.find(columns, column =>
          dimension.isSameBaseDimension(column.field_ref),
        );
      });
    }

    const [enabledColumns, disabledColumns] = _.partition(
      value
        .filter(columnSetting =>
          findColumnForColumnSetting(columns, columnSetting),
        )
        .map((columnSetting, index) => ({ ...columnSetting, index })),
      columnSetting => columnSetting.enabled,
    );

    return (
      <div className="list">
        {enabledColumns.length > 0 ? (
          <ChartSettingOrderedItems
            items={enabledColumns}
            getItemName={this.getColumnName}
            onEdit={this.handleEdit}
            onRemove={this.handleDisable}
            onSortEnd={this.handleSortEnd}
            distance={5}
          />
        ) : (
          <div className="my2 p2 flex layout-centered bg-grey-0 text-light text-bold rounded">
            {t`Add fields from the list below`}
          </div>
        )}
        {disabledColumns.length > 0 || additionalFieldOptions.count > 0 ? (
          <h4 className="mb2 mt4 pt4 border-top">{t`More columns`}</h4>
        ) : null}
        <div data-testid="disabled-columns">
          {disabledColumns.map((columnSetting, index) => (
            <ColumnItem
              key={index}
              title={this.getColumnName(columnSetting)}
              onAdd={() => this.handleEnable(columnSetting)}
              onClick={() => this.handleEnable(columnSetting)}
            />
          ))}
        </div>
        {additionalFieldOptions.count > 0 && (
          <div>
            {additionalFieldOptions.dimensions.map((dimension, index) => (
              <ColumnItem
                key={index}
                title={dimension.displayName()}
                onAdd={() => this.handleAddNewField(dimension.mbql())}
              />
            ))}
            {additionalFieldOptions.fks.map((fk, index) => (
              <div key={fk.id}>
                <div className="my2 text-medium text-bold text-uppercase text-small">
                  {fk.name ||
                    (fk.field.target
                      ? fk.field.target.table.display_name
                      : fk.field.display_name)}
                </div>
                {fk.dimensions.map((dimension, index) => (
                  <ColumnItem
                    key={index}
                    title={dimension.displayName()}
                    onAdd={() => this.handleAddNewField(dimension.mbql())}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
