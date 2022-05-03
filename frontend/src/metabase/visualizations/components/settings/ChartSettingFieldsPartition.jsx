/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";
import { assocIn } from "icepick";

import styled from "@emotion/styled";
import colors, { lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Grabber from "metabase/components/Grabber";
import Text from "metabase/components/type/Text";
import Toggle from "metabase/core/components/Toggle";

import {
  COLUMN_SHOW_TOTALS,
  COLUMN_SORT_ORDER,
  COLUMN_SORT_ORDER_ASC,
  COLUMN_SORT_ORDER_DESC,
} from "metabase/lib/data_grid";
import { keyForColumn } from "metabase/lib/dataset";
import {
  FormattingOptionsRoot,
  ShowTotalsOptionRoot,
  SortOrderOptionRoot,
} from "./ChartSettingFieldsPartition.styled";

const DragWrapper = styled.div`
  padding: 12px 14px;
  box-shadow: 0 2px 3px ${lighten(colors["text-dark"], 1.5)};
  &:hover {
    box-shadow: 0 2px 5px ${lighten(colors["text-dark"], 1.3)};
    transition: all 300ms linear;
  }
`;

function ShowTotalsOption({ value, onChange }) {
  if (value === null) {
    return null;
  }
  return (
    <ShowTotalsOptionRoot>
      <Text>{t`Show totals`}</Text>
      <Toggle value={value} onChange={() => onChange(!value)}></Toggle>
    </ShowTotalsOptionRoot>
  );
}

function SortButton({ iconName, onChange, currentValue, buttonValue }) {
  const isSelected = buttonValue === currentValue;
  return (
    <Icon
      name={iconName}
      onClick={() => onChange(isSelected ? undefined : buttonValue)}
      size={16}
      className={cx("sort cursor-pointer", {
        "text-brand": isSelected,
        "text-medium text-brand-hover": !isSelected,
      })}
    />
  );
}

function SortOrderOption({ value, onChange }) {
  return (
    <SortOrderOptionRoot>
      <Text>{t`Sort order`}</Text>
      <div>
        <SortButton
          iconName="arrow_up"
          onChange={onChange}
          currentValue={value}
          buttonValue={COLUMN_SORT_ORDER_ASC}
        />
        <SortButton
          iconName="arrow_down"
          onChange={onChange}
          currentValue={value}
          buttonValue={COLUMN_SORT_ORDER_DESC}
        />
      </div>
    </SortOrderOptionRoot>
  );
}

function FormattingOptions({ onEdit }) {
  return (
    <FormattingOptionsRoot>
      <Text>{t`Formatting`}</Text>
      <Text
        onClick={onEdit}
        className="text-brand text-bold cursor-pointer"
      >{t`See options…`}</Text>
    </FormattingOptionsRoot>
  );
}

function ColumnOptionsPanel({
  partitionName,
  getColumnSettingValue,
  onChangeColumnSetting,
  onEditFormatting,
}) {
  return (
    <div>
      {partitionName !== "values" && (
        <div>
          <ShowTotalsOption
            value={getColumnSettingValue(COLUMN_SHOW_TOTALS)}
            onChange={onChangeColumnSetting.bind(null, COLUMN_SHOW_TOTALS)}
          />
          <SortOrderOption
            value={getColumnSettingValue(COLUMN_SORT_ORDER)}
            onChange={onChangeColumnSetting.bind(null, COLUMN_SORT_ORDER)}
          />
        </div>
      )}
      <FormattingOptions onEdit={onEditFormatting} />
    </div>
  );
}

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedValue: null };
  }

  handleChangeColumnSetting = (column, settingName, value) => {
    const { settings, onChangeSettings } = this.props;
    const column_settings = assocIn(
      settings.column_settings,
      [keyForColumn(column), settingName],
      value,
    );
    onChangeSettings({ column_settings });
  };

  getColumnSettingValue = (column, settingName) => {
    const columnSettings = this.props.settings.column(column);
    return columnSettings && columnSettings[settingName];
  };

  handleEditFormatting = column => {
    if (column) {
      this.props.onShowWidget({
        id: "column_settings",
        props: {
          initialKey: keyForColumn(column),
        },
      });
    }
  };
  updateDisplayedValue = displayedValue =>
    this.setState({
      displayedValue: _.mapObject(displayedValue, cols =>
        cols.map(col => col.field_ref),
      ),
    });
  commitDisplayedValue = () => {
    const { displayedValue } = this.state;
    if (displayedValue != null) {
      this.props.onChange(displayedValue);
      this.setState({ displayedValue: null });
    }
  };

  render() {
    const value = _.mapObject(
      this.state.displayedValue || this.props.value || {},
      fieldRefs =>
        fieldRefs
          .map(field_ref =>
            this.props.columns.find(col => _.isEqual(col.field_ref, field_ref)),
          )
          .filter(col => col != null),
    );
    return (
      <div>
        {this.props.partitions.map(({ name, title, columnFilter }, index) => (
          <Partition
            key={index}
            className={cx("py2", { "border-top": index > 0 })}
            title={title}
            columnFilter={columnFilter}
            partitionName={name}
            columns={value[name]}
            value={value}
            getColumnSettingValue={this.getColumnSettingValue}
            onChangeColumnSetting={this.handleChangeColumnSetting}
            onEditFormatting={this.handleEditFormatting}
            updateDisplayedValue={this.updateDisplayedValue}
            commitDisplayedValue={this.commitDisplayedValue}
          />
        ))}
      </div>
    );
  }
}

@DropTarget(
  "columns",
  {
    // Using a drop target here is a hack to work around another issue.
    // The version of react-dnd we're on has a bug where endDrag isn't called.
    // Drop is still called here, so we trigger commit here.
    drop: (props, monitor, component) => {
      props.commitDisplayedValue();
    },
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
class Partition extends React.Component {
  render() {
    const {
      columns = [],
      partitionName,
      columnFilter,
      onChangeColumnSetting,
      getColumnSettingValue,
      onEditFormatting,
      updateDisplayedValue,
      commitDisplayedValue,
      value,
      connectDropTarget,
      title,
      className,
    } = this.props;
    return connectDropTarget(
      <div className={className}>
        <Label color="medium">{title}</Label>
        {columns.length === 0 ? (
          <EmptyPartition
            columnFilter={columnFilter}
            value={value}
            partitionName={partitionName}
            updateDisplayedValue={updateDisplayedValue}
          />
        ) : (
          columns.map((col, index) => (
            <Column
              key={index}
              partitionName={partitionName}
              column={col}
              index={index}
              columnFilter={columnFilter}
              value={value}
              onChangeColumnSetting={onChangeColumnSetting}
              getColumnSettingValue={getColumnSettingValue}
              onEditFormatting={onEditFormatting}
              updateDisplayedValue={updateDisplayedValue}
              commitDisplayedValue={commitDisplayedValue}
            />
          ))
        )}
      </div>,
    );
  }
}

@DropTarget(
  "columns",
  {
    hover: (props, monitor, component) => {
      const item = monitor.getItem();
      if (props.columnFilter && props.columnFilter(item.column) === false) {
        return;
      }
      const { index: dragIndex, partitionName: itemPartition } = item;
      const { value, partitionName, updateDisplayedValue } = props;
      updateDisplayedValue({
        ...value,
        [itemPartition]: [
          ...value[itemPartition].slice(0, dragIndex),
          ...value[itemPartition].slice(dragIndex + 1),
        ],
        [partitionName]: [value[itemPartition][dragIndex]],
      });
      item.index = 0;
      item.partitionName = partitionName;
    },
  },
  (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
)
class EmptyPartition extends React.Component {
  render() {
    return this.props.connectDropTarget(
      <div className="p2 text-centered bg-light rounded text-medium">{t`Drag fields here`}</div>,
    );
  }
}

class ColumnInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { expanded: false };
  }
  toggleExpand = () => {
    const { expanded } = this.state;
    this.setState({ expanded: !expanded });
  };
  handleEditFormatting = () => {
    const { column, onEditFormatting } = this.props;
    onEditFormatting && onEditFormatting(column);
  };
  render() {
    const {
      column,
      connectDragSource,
      connectDropTarget,
      isDragging,
      partitionName,
      onChangeColumnSetting,
      getColumnSettingValue,
    } = this.props;
    const { expanded } = this.state;
    const showOptionsPanel = expanded && !isDragging;
    return connectDropTarget(
      connectDragSource(
        <div>
          <DragWrapper
            className={cx(
              "text-dark mb1 bordered rounded cursor-grab text-bold",
              { disabled: isDragging },
            )}
          >
            <div
              className={cx(
                "text-dark text-bold cursor-grab flex justify-between",
              )}
            >
              <span
                onClick={this.toggleExpand}
                className="cursor-pointer text-brand-hover hover-parent hover--inherit"
              >
                {column.display_name}
                <Icon
                  name={expanded ? "chevronup" : "chevrondown"}
                  size="10"
                  className="text-light hover-child hover--inherit ml1"
                />
              </span>
              <Grabber style={{ width: 10 }} />
            </div>
            {showOptionsPanel && (
              <ColumnOptionsPanel
                className="text-medium"
                partitionName={partitionName}
                onChangeColumnSetting={onChangeColumnSetting.bind(null, column)}
                getColumnSettingValue={getColumnSettingValue.bind(null, column)}
                onEditFormatting={this.handleEditFormatting}
              />
            )}
          </DragWrapper>
        </div>,
      ),
    );
  }
}

const Column = _.compose(
  DropTarget(
    "columns",
    {
      hover: (props, monitor, component) => {
        const item = monitor.getItem();
        if (props.columnFilter && props.columnFilter(item.column) === false) {
          return;
        }
        const { index: dragIndex, partitionName: itemPartition } = item;
        const hoverIndex = props.index;
        const { value, partitionName, updateDisplayedValue } = props;
        if (partitionName === itemPartition && dragIndex !== hoverIndex) {
          const columns = value[itemPartition];
          const columnsDup = [...columns];
          columnsDup[dragIndex] = columns[hoverIndex];
          columnsDup[hoverIndex] = columns[dragIndex];
          updateDisplayedValue({ ...value, [itemPartition]: columnsDup });
          item.index = hoverIndex;
        } else if (partitionName !== itemPartition) {
          updateDisplayedValue({
            ...value,
            [itemPartition]: [
              ...value[itemPartition].slice(0, dragIndex),
              ...value[itemPartition].slice(dragIndex + 1),
            ],
            [partitionName]: [
              ...value[partitionName].slice(0, hoverIndex),
              value[itemPartition][dragIndex],
              ...value[partitionName].slice(hoverIndex),
            ],
          });
          item.index = hoverIndex;
          item.partitionName = partitionName;
        }
      },
      drop: ({ index, column, partitionName }, monitor, component) => ({
        index,
        column,
        partitionName,
      }),
    },
    (connect, monitor) => ({ connectDropTarget: connect.dropTarget() }),
  ),
  DragSource(
    "columns",
    {
      beginDrag: ({ column, partitionName, index }) => ({
        column,
        partitionName,
        index,
      }),
      endDrag: (props, monitor, component) => {
        // props.commitDisplayedValue();
      },
    },
    (connect, monitor) => ({
      connectDragSource: connect.dragSource(),
      isDragging: monitor.isDragging(),
    }),
  ),
)(ColumnInner);

export default ChartSettingFieldsPartition;
