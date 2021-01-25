import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { Flex } from "grid-styled";
import { DragSource, DropTarget } from "react-dnd";
import _ from "underscore";
import colors, { lighten } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Grabber from "metabase/components/Grabber";
import Text from "metabase/components/type/Text";
import Toggle from "metabase/components/Toggle";

import { keyForColumn } from "metabase/lib/dataset";

// eslint-disable-next-line no-unused-vars
class ShowTotalsOption extends React.Component {
  constructor(props) {
    super(props);
    this.state = { showTotals: true };
  }
  toggleTotals = () => {
    const { showTotals } = this.state;
    this.setState({ showTotals: !showTotals });
    this.props.onChangeTotalsVisibility(!showTotals);
  };
  render() {
    const { showTotals } = this.state;
    return (
      <Flex pt={2} justifyContent="space-between" alignItems="center">
        <Text>{t`Show totals`}</Text>
        <Toggle value={showTotals} onChange={this.toggleTotals}></Toggle>
      </Flex>
    );
  }
}

// eslint-disable-next-line no-unused-vars
class SortIcon extends React.Component {
  render() {
    const { name, onClick } = this.props;
    return (
      <Icon
        name={name}
        onClick={onClick}
        size={16}
        className="sort cursor-pointer text-medium text-brand-hover"
      />
    );
  }
}

// eslint-disable-next-line no-unused-vars
class SortOrderOption extends React.Component {
  handleSortUp = () => {
    this.props.onChangeSortOrder("ascending");
  };
  handleSortDown = () => {
    this.props.onChangeSortOrder("descending");
  };
  render() {
    return (
      <Flex pt={1} justifyContent="space-between" alignItems="center">
        <Text>{t`Sort order`}</Text>
        <div>
          <SortIcon name="arrow_up" onClick={this.handleSortUp} />
          <SortIcon name="arrow_down" onClick={this.handleSortDown} />
        </div>
      </Flex>
    );
  }
}

class FormattingOptions extends React.Component {
  render() {
    return (
      <Flex pt={1} justifyContent="space-between" alignItems="center">
        <Text>{t`Formatting`}</Text>
        <Text
          onClick={this.props.onEdit}
          className="text-brand text-bold cursor-pointer"
        >{t`See options…`}</Text>
      </Flex>
    );
  }
}

class ColumnOptionsPanel extends React.Component {
  render() {
    // const { partitionName } = this.props;
    return (
      <div>
        {/* not yet implemented, but we're including the UI now for string translation
           partitionName !== "values" && (
          <div>
            <ShowTotalsOption
              onChangeTotalsVisibility={this.props.onChangeTotalsVisibility}
            />
            <SortOrderOption onChangeSortOrder={this.props.onChangeSortOrder} />
          </div>
        )*/}
        <FormattingOptions onEdit={this.props.onEditFormatting} />
      </div>
    );
  }
}

class ChartSettingFieldsPartition extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedValue: null };
  }

  handleChangeTotalsVisibility = (column, totalsVisibility) => {
    const { onChangeTotalsVisibility } = this.props;
    onChangeTotalsVisibility &&
      onChangeTotalsVisibility(keyForColumn(column), totalsVisibility);
  };

  handleChangeSortOrder = (column, direction) => {
    const { onChangeSortOrder } = this.props;
    onChangeSortOrder && onChangeSortOrder(keyForColumn(column), direction);
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
            className={cx("py2", { "border-top": index > 0 })}
            title={title}
            columnFilter={columnFilter}
            partitionName={name}
            columns={value[name]}
            value={value}
            onChangeTotalsVisibility={this.handleChangeTotalsVisibility}
            onChangeSortOrder={this.handleChangeSortOrder}
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
      onChangeTotalsVisibility,
      onChangeSortOrder,
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
              partitionName={partitionName}
              column={col}
              index={index}
              columnFilter={columnFilter}
              value={value}
              onChangeTotalsVisibility={onChangeTotalsVisibility}
              onChangeSortOrder={onChangeSortOrder}
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
  handleChangeTotalsVisibility = totalsVisibility => {
    const { column, onChangeTotalsVisibility } = this.props;
    onChangeTotalsVisibility &&
      onChangeTotalsVisibility(column, totalsVisibility);
  };
  handleChangeSortOrder = direction => {
    const { column, onChangeSortOrder } = this.props;
    onChangeSortOrder && onChangeSortOrder(column, direction);
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
    } = this.props;
    const { expanded } = this.state;
    const showOptionsPanel = expanded && !isDragging;
    return connectDropTarget(
      connectDragSource(
        <div
          className="mb1 bordered rounded"
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
              onChangeTotalsVisibility={this.handleChangeTotalsVisibility}
              onChangeSortOrder={this.handleChangeSortOrder}
              onEditFormatting={this.handleEditFormatting}
            />
          )}
        </div>,
      ),
    );
  }
}

export default ChartSettingFieldsPartition;
