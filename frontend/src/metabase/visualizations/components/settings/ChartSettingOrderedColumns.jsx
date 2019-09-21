import React, { Component } from "react";
import { t } from "ttag";

import ColumnItem from "./ColumnItem";

import { SortableContainer, SortableElement } from "react-sortable-hoc";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { keyForColumn, findColumnForColumnSetting } from "metabase/lib/dataset";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import _ from "underscore";

const SortableColumn = SortableElement(
  ({ columnSetting, getColumnName, onEdit, onRemove }) => (
    <ColumnItem
      title={getColumnName(columnSetting)}
      onEdit={onEdit ? () => onEdit(columnSetting) : null}
      onRemove={onRemove ? () => onRemove(columnSetting) : null}
      draggable
    />
  ),
);

const SortableColumnList = SortableContainer(
  ({ columnSettings, getColumnName, onEdit, onRemove }) => {
    return (
      <div>
        {columnSettings.map((columnSetting, index) => (
          <SortableColumn
            key={`item-${index}`}
            index={columnSetting.index}
            columnSetting={columnSetting}
            getColumnName={getColumnName}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </div>
    );
  },
);

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

  handleEdit = columnSetting => {
    const column = findColumnForColumnSetting(
      this.props.columns,
      columnSetting,
    );
    if (column) {
      this.props.onShowWidget({
        id: "column_settings",
        props: {
          initialKey: keyForColumn(column),
        },
      });
    }
  };

  handleAddNewField = fieldRef => {
    const { value, onChange } = this.props;
    const columnSettings = [...value, { fieldRef, enabled: true }];
    onChange(columnSettings);
  };

  getColumnName = columnSetting =>
    getFriendlyName(
      findColumnForColumnSetting(this.props.columns, columnSetting) || {
        display_name: "[Unknown]",
      },
    );

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
        <div>{t`Click and drag to change their order`}</div>
        {enabledColumns.length > 0 ? (
          <SortableColumnList
            columnSettings={enabledColumns}
            getColumnName={this.getColumnName}
            onEdit={this.handleEdit}
            onRemove={this.handleDisable}
            onSortEnd={this.handleSortEnd}
            distance={5}
            helperClass="z5"
          />
        ) : (
          <div className="my2 p2 flex layout-centered bg-grey-0 text-light text-bold rounded">
            {t`Add fields from the list below`}
          </div>
        )}
        {disabledColumns.length > 0 || additionalFieldOptions.count > 0 ? (
          <h4 className="mb2 mt4 pt4 border-top">{`More columns`}</h4>
        ) : null}
        {disabledColumns.map((columnSetting, index) => (
          <ColumnItem
            key={index}
            title={this.getColumnName(columnSetting)}
            onAdd={() => this.handleEnable(columnSetting)}
            onClick={() => this.handleEnable(columnSetting)}
          />
        ))}
        {additionalFieldOptions.count > 0 && (
          <div>
            {additionalFieldOptions.dimensions.map((dimension, index) => (
              <ColumnItem
                key={index}
                title={dimension.displayName()}
                onAdd={() => this.handleAddNewField(dimension.mbql())}
              />
            ))}
            {additionalFieldOptions.fks.map(fk => (
              <div>
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
