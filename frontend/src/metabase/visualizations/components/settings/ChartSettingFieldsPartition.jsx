import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";
import colors, { lighten } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Grabber from "metabase/components/Grabber";
import Toggle from "metabase/components/Toggle";

class ShowTotalsOption extends React.Component {
  constructor(props) {
    super(props);
    this.state = { showTotals: true };
  }
  toggleTotals = () => {
    const { showTotals } = this.state;
    this.setState({ showTotals: !showTotals });
  };
  render() {
    const { showTotals } = this.state;
    return (
      <div
        className={cx("flex", "justify-between")}
        style={{ padding: "14px 0 0 0" }}
      >
        <span className="flex-auto">{t`Show totals`}</span>
        <Toggle value={showTotals} onChange={this.toggleTotals}></Toggle>
      </div>
    );
  }
}
class SortIcon extends React.Component {
  render() {
    const { name } = this.props;
    return (
      <Icon
        name={name}
        className={cx("sort", "cursor-pointer", "text-brand-hover")}
      />
    );
  }
}

class SortOrderOption extends React.Component {
  render() {
    return (
      <div
        className={cx("flex", "justify-between")}
        style={{ padding: "14px 0 0 0" }}
      >
        <span className="flex-auto">{t`Sort order`}</span>
        <SortIcon name="arrow_up" />
        <SortIcon name="arrow_down" />
      </div>
    );
  }
}

class FormattingOptions extends React.Component {
  render() {
    return (
      <div
        className={cx("flex", "justify-between")}
        style={{ padding: "14px 0 0 0" }}
      >
        <span className="flex-auto cursor-pointer">{t`Formatting...`}</span>
      </div>
    );
  }
}

class ColumnOptionsPanel extends React.Component {
  render() {
    const { partitionName } = this.props;
    return (
      <div>
        {partitionName !== "values" && (
          <div>
            <ShowTotalsOption />
            <SortOrderOption />
          </div>
        )}
        <FormattingOptions />
      </div>
    );
  }
}

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedValue: null };
  }

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
            className={cx("py2", { "border-top": index > 0 })}
            title={title}
            columnFilter={columnFilter}
            partitionName={name}
            columns={value[name]}
            value={value}
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
              partitionName={partitionName}
              column={col}
              index={index}
              columnFilter={columnFilter}
              value={value}
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

@DropTarget(
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
)
@DragSource(
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
)
class Column extends React.Component {
  constructor(props) {
    super(props);
    this.state = { expanded: false };
  }
  toggleExpand = () => {
    const { expanded } = this.state;
    this.setState({ expanded: !expanded });
  };
  render() {
    const {
      column,
      connectDragSource,
      connectDropTarget,
      isDragging,
      partitionName,
    } = this.props;
    const { expanded } = this.state;
    const showOptionsPanel = expanded && !isDragging;
    return connectDropTarget(
      connectDragSource(
        <div
          className={cx("mb1 bordered rounded")}
          style={{
            padding: "12px 14px",
            "box-shadow": `0 2px 3px ${lighten(colors["text-dark"], 1.5)}`,
            "&:hover": {
              "box-shadow": `0 2px 5px ${lighten(colors["text-dark"], 1.3)}`,
              transition: "all 300ms linear",
            },
          }}
        >
          <div
            className={cx(
              "text-dark text-bold cursor-grab flex justify-between",
              { disabled: isDragging },
            )}
          >
            <span className="flex-auto">
              {column.display_name}
              <Icon
                name="chevrondown"
                onClick={this.toggleExpand}
                size="10"
                className="cursor-pointer text-light text-medium-hover ml1"
              />
            </span>
            <Grabber style={{ width: 10 }} />
          </div>
          {showOptionsPanel && (
            <ColumnOptionsPanel
              className={cx("text-medium")}
              partitionName={partitionName}
            />
          )}
        </div>,
      ),
    );
  }
}

export default ChartSettingFieldsPartition;
