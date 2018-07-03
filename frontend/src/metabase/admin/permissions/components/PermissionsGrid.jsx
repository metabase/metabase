/* eslint-disable react/display-name */

import React, { Component } from "react";

import { Link } from "react-router";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Icon from "metabase/components/Icon.jsx";
import ConfirmContent from "metabase/components/ConfirmContent.jsx";
import Modal from "metabase/components/Modal.jsx";

import FixedHeaderGrid from "./FixedHeaderGrid.jsx";
import { AutoSizer } from "react-virtualized";

import { isAdminGroup } from "metabase/lib/groups";
import { capitalize, pluralize } from "metabase/lib/formatting";
import cx from "classnames";
import _ from "underscore";

import colors from "metabase/lib/colors";

const LIGHT_BORDER = colors["text-light"];
const DARK_BORDER = colors["text-medium"];
const BORDER_RADIUS = 4;

const getBorderStyles = ({
  isFirstColumn,
  isLastColumn,
  isFirstRow,
  isLastRow,
}) => ({
  overflow: "hidden",
  border: "1px solid " + LIGHT_BORDER,
  borderTopWidth: isFirstRow ? 1 : 0,
  borderRightWidth: isLastColumn ? 1 : 0,
  borderLeftColor: isFirstColumn ? LIGHT_BORDER : DARK_BORDER,
  borderTopRightRadius: isLastColumn && isFirstRow ? BORDER_RADIUS : 0,
  borderTopLeftRadius: isFirstColumn && isFirstRow ? BORDER_RADIUS : 0,
  borderBottomRightRadius: isLastColumn && isLastRow ? BORDER_RADIUS : 0,
  borderBottomLeftRadius: isFirstColumn && isLastRow ? BORDER_RADIUS : 0,
});

const DEFAULT_CELL_HEIGHT = 100;
const CELL_WIDTH = 246;
const HEADER_HEIGHT = 65;
const HEADER_WIDTH = 240;

const DEFAULT_OPTION = {
  icon: "unknown",
  iconColor: colors["text-medium"],
  bgColor: colors["bg-medium"],
};

const PermissionsHeader = ({ permissions, isFirst, isLast }) => (
  <div
    className="flex"
    style={getBorderStyles({
      isFirstColumn: isFirst,
      isLastColumn: isLast,
      isFirstRow: true,
      isLastRow: false,
    })}
  >
    {permissions.map((permission, index) => (
      <div
        key={permission.id}
        className="flex-full border-column-divider"
        style={{
          borderColor: LIGHT_BORDER,
        }}
      >
        {permission.header && (
          <h5 className="my1 text-centered text-grey-3 text-uppercase text-light">
            {permission.header}
          </h5>
        )}
      </div>
    ))}
  </div>
);

const GroupHeader = ({
  group,
  permissions,
  isColumn,
  isRow,
  isFirst,
  isLast,
}) => (
  <div>
    <h4 className="text-centered full my1 flex layout-centered">
      {group.name}
      {group.tooltip && (
        <Tooltip tooltip={group.tooltip} maxWidth="24em">
          <Icon className="ml1" name="question" />
        </Tooltip>
      )}
    </h4>
    {permissions && (
      <PermissionsHeader
        permissions={permissions}
        isFirst={isFirst}
        isLast={isLast}
      />
    )}
  </div>
);

const EntityHeader = ({
  entity,
  icon,
  permissions,
  isRow,
  isColumn,
  isFirst,
  isLast,
}) => (
  <div className="flex flex-column">
    <div className={cx("relative flex", { "align-self-center mb1": isColumn })}>
      <Icon name={icon} className="mr1" />
      <div className="flex-full">
        <h4>{entity.name}</h4>
        {entity.subtitle && (
          <div className="mt1 h5 text-monospace text-normal text-grey-2 text-uppercase">
            {entity.subtitle}
          </div>
        )}
        {entity.link && (
          <div className="mt1">
            <Link className="link" to={entity.link.url}>
              {entity.link.name}
            </Link>
          </div>
        )}
      </div>
    </div>

    {permissions && (
      <PermissionsHeader
        permissions={permissions}
        isFirst={isFirst}
        isLast={isLast}
      />
    )}
  </div>
);

const CornerHeader = ({ grid }) => (
  <div className="absolute bottom left right flex flex-column align-center pb1">
    <div className="flex align-center">
      <h3 className="ml1">{capitalize(pluralize(grid.type))}</h3>
    </div>
  </div>
);

const PermissionsCell = ({
  group,
  permissions,
  entity,
  onUpdatePermission,
  cellHeight,
  isFirstRow,
  isLastRow,
  isFirstColumn,
  isLastColumn,
  isFaded,
}) => (
  <div
    className="flex"
    style={getBorderStyles({
      isLastRow,
      isLastColumn,
      isFirstColumn,
      isFirstRow,
    })}
  >
    {permissions.map(permission => (
      <GroupPermissionCell
        key={permission.id}
        permission={permission}
        group={group}
        entity={entity}
        onUpdatePermission={onUpdatePermission}
        cellHeight={cellHeight}
        isEditable={group.editable}
        isFaded={isFaded}
      />
    ))}
  </div>
);

class GroupPermissionCell extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      confirmations: null,
      confirmAction: null,
      hovered: false,
    };
  }
  hoverEnter() {
    // only change the hover state if the group is not the admin
    // this helps indicate to users that the admin group is different
    if (this.props.isEditable) {
      return this.setState({ hovered: true });
    }
    return false;
  }
  hoverExit() {
    if (this.props.isEditable) {
      return this.setState({ hovered: false });
    }
    return false;
  }
  render() {
    const {
      permission,
      group,
      entity,
      onUpdatePermission,
      isFaded,
      cellHeight,
    } = this.props;
    const { confirmations } = this.state;

    const value = permission.getter(group.id, entity.id);
    const options = permission.options(group.id, entity.id);
    const warning =
      permission.warning && permission.warning(group.id, entity.id);

    let isEditable =
      this.props.isEditable &&
      options.filter(option => option.value !== value).length > 0;
    const option = _.findWhere(options, { value }) || DEFAULT_OPTION;

    return (
      <PopoverWithTrigger
        ref="popover"
        disabled={!isEditable}
        triggerClasses="cursor-pointer flex flex-full layout-centered border-column-divider"
        triggerElement={
          <Tooltip tooltip={option.tooltip}>
            <div
              className={cx("flex-full flex layout-centered relative", {
                "cursor-pointer": isEditable,
                faded: isFaded,
              })}
              style={{
                borderColor: LIGHT_BORDER,
                height: cellHeight - 1,
                backgroundColor: this.state.hovered
                  ? option.iconColor
                  : option.bgColor,
              }}
              onMouseEnter={() => this.hoverEnter()}
              onMouseLeave={() => this.hoverExit()}
            >
              <Icon
                name={option.icon}
                size={28}
                style={{
                  color: this.state.hovered
                    ? colors["text-white"]
                    : option.iconColor,
                }}
              />
              {confirmations &&
                confirmations.length > 0 && (
                  <Modal>
                    <ConfirmContent
                      {...confirmations[0]}
                      onAction={() =>
                        // if it's the last one call confirmAction, otherwise remove the confirmation that was just confirmed
                        confirmations.length === 1
                          ? this.setState(
                              { confirmations: null, confirmAction: null },
                              this.state.confirmAction,
                            )
                          : this.setState({
                              confirmations: confirmations.slice(1),
                            })
                      }
                      onCancel={() =>
                        this.setState({
                          confirmations: null,
                          confirmAction: null,
                        })
                      }
                    />
                  </Modal>
                )}
              {warning && (
                <div className="absolute top right p1">
                  <Tooltip tooltip={warning} maxWidth="24em">
                    <Icon name="warning" className="text-slate" />
                  </Tooltip>
                </div>
              )}
            </div>
          </Tooltip>
        }
      >
        <AccessOptionList
          value={value}
          options={options}
          permission={permission}
          onChange={value => {
            const confirmAction = () => {
              onUpdatePermission({
                groupId: group.id,
                entityId: entity.id,
                value: value,
                updater: permission.updater,
                postAction: permission.postAction,
              });
            };
            let confirmations = (
              (permission.confirm &&
                permission.confirm(group.id, entity.id, value)) ||
              []
            ).filter(c => c);
            if (confirmations.length > 0) {
              this.setState({ confirmations, confirmAction });
            } else {
              confirmAction();
            }
            this.refs.popover.close();
          }}
        />
      </PopoverWithTrigger>
    );
  }
}

const AccessOption = ({ value, option, onChange }) => (
  <div
    className={cx(
      "flex py2 px2 align-center bg-brand-hover text-white-hover cursor-pointer",
      {
        "bg-brand text-white": value === option,
      },
    )}
    onClick={() => onChange(option.value)}
  >
    <Icon
      name={option.icon}
      className="mr1"
      style={{ color: option.iconColor }}
      size={18}
    />
    {option.title}
  </div>
);

const AccessOptionList = ({ value, options, onChange }) => (
  <ul className="py1">
    {options.map(option => {
      if (value !== option.value) {
        return (
          <li key={option.value}>
            <AccessOption value={value} option={option} onChange={onChange} />
          </li>
        );
      }
    })}
  </ul>
);

const PermissionsGrid = ({
  className,
  grid,
  onUpdatePermission,
  entityId,
  groupId,
  isPivoted = false,
  showHeader = true,
  cellHeight = DEFAULT_CELL_HEIGHT,
}) => {
  const permissions = Object.entries(grid.permissions).map(
    ([id, permission]) => ({ id: id, ...permission }),
  );

  let rowCount, columnCount, headerHeight;
  if (isPivoted) {
    rowCount = grid.groups.length;
    columnCount = grid.entities.length;
    headerHeight =
      HEADER_HEIGHT +
      Math.max(
        ...grid.entities.map(
          entity => (entity.subtitle ? 15 : 0) + (entity.link ? 15 : 0),
        ),
      );
  } else {
    rowCount = grid.entities.length;
    columnCount = grid.groups.length;
    headerHeight = HEADER_HEIGHT;
  }
  return (
    <div className={className}>
      <AutoSizer>
        {({ height, width }) => (
          <FixedHeaderGrid
            height={height}
            width={width}
            rowCount={rowCount}
            columnCount={columnCount}
            columnWidth={Math.max(
              CELL_WIDTH,
              (width - 20 - HEADER_WIDTH) / columnCount,
            )}
            rowHeight={cellHeight}
            paddingBottom={20}
            paddingRight={20}
            columnHeaderHeight={showHeader ? headerHeight : 0}
            rowHeaderWidth={HEADER_WIDTH}
            renderCell={({ columnIndex, rowIndex }) => {
              const group = grid.groups[isPivoted ? rowIndex : columnIndex];
              const entity = grid.entities[isPivoted ? columnIndex : rowIndex];
              return (
                <PermissionsCell
                  group={group}
                  permissions={permissions}
                  entity={entity}
                  onUpdatePermission={onUpdatePermission}
                  cellHeight={cellHeight}
                  isFirstRow={showHeader ? false : rowIndex === 0}
                  isLastRow={rowIndex === rowCount - 1}
                  isFirstColumn={columnIndex === 0}
                  isLastColumn={columnIndex === columnCount - 1}
                  isFaded={
                    isAdminGroup(group) ||
                    (groupId != null && group.id !== groupId) ||
                    (entityId != null && !_.isEqual(entityId, entity.id))
                  }
                />
              );
            }}
            renderColumnHeader={
              showHeader
                ? ({ columnIndex }) => (
                    <div className="absolute bottom left right">
                      {isPivoted ? (
                        <EntityHeader
                          icon={grid.icon}
                          entity={grid.entities[columnIndex]}
                          permissions={permissions}
                          isFirst={columnIndex === 0}
                          isLast={columnIndex === columnCount - 1}
                          isColumn
                        />
                      ) : (
                        <GroupHeader
                          group={grid.groups[columnIndex]}
                          permissions={permissions}
                          isFirst={columnIndex === 0}
                          isLast={columnIndex === columnCount - 1}
                          isColumn
                        />
                      )}
                    </div>
                  )
                : undefined
            }
            renderRowHeader={({ rowIndex }) => (
              <div className="spread flex align-center p2">
                {isPivoted ? (
                  <GroupHeader
                    group={grid.groups[rowIndex]}
                    isFirst={rowIndex === 0}
                    isLast={rowIndex === rowCount - 1}
                    isRow
                  />
                ) : (
                  <EntityHeader
                    icon={grid.icon}
                    entity={grid.entities[rowIndex]}
                    isFirst={rowIndex === 0}
                    isLast={rowIndex === rowCount - 1}
                    isRow
                  />
                )}
              </div>
            )}
            renderCorner={
              showHeader ? () => <CornerHeader grid={grid} /> : undefined
            }
          />
        )}
      </AutoSizer>
    </div>
  );
};

export default PermissionsGrid;
