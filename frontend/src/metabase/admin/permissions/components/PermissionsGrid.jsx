/* eslint-disable react/display-name */

import React, { Component } from "react";

import { Link } from "react-router";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Icon from "metabase/components/Icon.jsx";
import ConfirmContent from "metabase/components/ConfirmContent.jsx";
import Modal from "metabase/components/Modal.jsx";

import FixedHeaderGrid from "./FixedHeaderGrid.jsx";
import { AutoSizer } from 'react-virtualized'

import { capitalize, pluralize } from "metabase/lib/formatting";
import cx from "classnames";

const LIGHT_BORDER = "rgb(225, 226, 227)";
const DARK_BORDER = "rgb(161, 163, 169)";
const BORDER_RADIUS = 4;

const getBorderStyles = ({ isFirstColumn, isLastColumn, isFirstRow, isLastRow }) => ({
    overflow: "hidden",
    border: "1px solid " + LIGHT_BORDER,
    borderTopWidth: isFirstRow ? 1 : 0,
    borderRightWidth: isLastColumn ? 1 : 0,
    borderLeftColor: isFirstColumn ? LIGHT_BORDER : DARK_BORDER,
    borderTopRightRadius: isLastColumn && isFirstRow ? BORDER_RADIUS : 0,
    borderTopLeftRadius: isFirstColumn && isFirstRow ? BORDER_RADIUS : 0,
    borderBottomRightRadius: isLastColumn && isLastRow ? BORDER_RADIUS : 0,
    borderBottomLeftRadius: isFirstColumn && isLastRow ? BORDER_RADIUS : 0,
})

const CELL_HEIGHT = 100;
const CELL_WIDTH = 246;
const HEADER_HEIGHT = 65;
const HEADER_WIDTH = 240;

const DEFAULT_OPTION = {
    icon: "unknown",
    iconColor: "#9BA5B1",
    bgColor: "#DFE8EA"
};

const GroupColumnHeader = ({ group, permissions, isLastColumn, isFirstColumn }) =>
    <div className="absolute bottom left right">
        <h4 className="text-centered full my1 flex layout-centered">
            { group.name }
            { group.tooltip &&
                <Tooltip tooltip={group.tooltip} maxWidth="24em">
                    <Icon className="ml1" name="question" />
                </Tooltip>
            }
        </h4>
        <div className="flex" style={getBorderStyles({ isLastColumn, isFirstColumn, isFirstRow: true, isLastRow: false })}>
            { permissions.map((permission, index) =>
                <div key={permission.id} className="flex-full border-column-divider" style={{
                    borderColor: LIGHT_BORDER,
                }}>
                    { permission.header &&
                        <h5 className="my1 text-centered text-grey-3 text-uppercase text-light">{permission.header}</h5>
                    }
                </div>
            )}
        </div>
    </div>

const PermissionsCell = ({ group, permissions, entity, onUpdatePermission, isLastRow, isLastColumn, isFirstColumn, isFaded }) =>
    <div className="flex" style={getBorderStyles({ isLastRow, isLastColumn, isFirstColumn, isFirstRow: false })}>
        { permissions.map(permission =>
            <GroupPermissionCell
                key={permission.id}
                permission={permission}
                group={group}
                entity={entity}
                onUpdatePermission={onUpdatePermission}
                isEditable={group.editable}
                isFaded={isFaded}
            />
        )}
    </div>

class GroupPermissionCell extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            confirmations: null,
            confirmAction: null,
            hovered: false
        }
    }
    hoverEnter () {
        // only change the hover state if the group is not the admin
        // this helps indicate to users that the admin group is different
        if (this.props.isEditable) {
            return this.setState({ hovered: true });
        }
        return false
    }
    hoverExit () {
        if (this.props.isEditable) {
            return this.setState({ hovered: false });
        }
        return false
    }
    render() {
        const { permission, group, entity, onUpdatePermission, isFaded } = this.props;
        const { confirmations } = this.state;

        const value = permission.getter(group.id, entity.id);
        const options = permission.options(group.id, entity.id);
        const warning = permission.warning && permission.warning(group.id, entity.id);

        let isEditable = this.props.isEditable && options.filter(option => option.value !== value).length > 0;
        const option = _.findWhere(options, { value }) || DEFAULT_OPTION;

        return (
                <PopoverWithTrigger
                    ref="popover"
                    disabled={!isEditable}
                    triggerClasses="cursor-pointer flex flex-full layout-centered border-column-divider"
                    triggerElement={
                        <Tooltip tooltip={option.tooltip}>
                            <div
                                className={cx('flex-full flex layout-centered relative', {
                                    'cursor-pointer' : isEditable,
                                    faded: isFaded
                                })}
                                style={{
                                    borderColor: LIGHT_BORDER,
                                    height: CELL_HEIGHT - 1,
                                    backgroundColor: this.state.hovered ? option.iconColor : option.bgColor,
                                }}
                                onMouseEnter={() => this.hoverEnter()}
                                onMouseLeave={() => this.hoverExit()}
                            >
                                <Icon
                                    name={option.icon}
                                    size={28}
                                    style={{ color: this.state.hovered ? '#fff' : option.iconColor }}
                                />
                                { confirmations && confirmations.length > 0 &&
                                    <Modal>
                                        <ConfirmContent
                                            {...confirmations[0]}
                                            onAction={() =>
                                                // if it's the last one call confirmAction, otherwise remove the confirmation that was just confirmed
                                                confirmations.length === 1 ?
                                                    this.setState({ confirmations: null, confirmAction: null }, this.state.confirmAction)
                                                :
                                                    this.setState({ confirmations: confirmations.slice(1) })
                                            }
                                            onCancel={() => this.setState({ confirmations: null, confirmAction: null })}
                                        />
                                    </Modal>
                                }
                                { warning &&
                                    <div className="absolute top right p1">
                                        <Tooltip tooltip={warning} maxWidth="24em">
                                            <Icon name="warning2" className="text-slate" />
                                        </Tooltip>
                                    </div>
                                }
                            </div>
                        </Tooltip>
                   }
                >
                    <AccessOptionList
                        value={value}
                        options={options}
                        permission={permission}
                        onChange={(value) => {
                            const confirmAction = () => {
                                onUpdatePermission({
                                    groupId: group.id,
                                    entityId: entity.id,
                                    value: value,
                                    updater: permission.updater,
                                    postAction: permission.postAction
                                })
                            }
                            let confirmations = (permission.confirm && permission.confirm(group.id, entity.id, value) || []).filter(c => c);
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

const AccessOption = ({ value, option, onChange }) =>
    <div
        className={cx("flex py2 px2 align-center bg-brand-hover text-white-hover cursor-pointer", {
            "bg-brand text-white": value === option
        })}
        onClick={() => onChange(option.value)}
    >
        <Icon name={option.icon} className="mr1" style={{ color: option.iconColor }} size={18} />
        {option.title}
    </div>

const AccessOptionList = ({ value, options, onChange }) =>
    <ul className="py1">
        { options.map(option => {
            if( value !== option.value ) {
                return (
                    <li key={option.value}>
                        <AccessOption value={value} option={option} onChange={onChange} />
                    </li>
               )
            }
        }
        )}
    </ul>

const EntityRowHeader = ({ entity, icon }) =>
    <div
        className="flex flex-column justify-center px1 pl4 ml2"
        style={{
            height: CELL_HEIGHT
        }}
    >
        <div className="relative flex align-center">
            <Icon name={icon} className="absolute" style={{ left: -28 }} />
            <h4>{entity.name}</h4>
        </div>
        { entity.subtitle &&
            <span className="mt1 h5 text-monospace text-normal text-grey-2 text-uppercase">{entity.subtitle}</span>
        }
        { entity.link &&
            <Link className="mt1 link" to={entity.link.url}>{entity.link.name}</Link>
        }
    </div>

const CornerHeader = ({ grid }) =>
    <div className="absolute bottom left right flex flex-column align-center pb1">
        <div className="flex align-center">
            <h3 className="ml1">{capitalize(pluralize(grid.type))}</h3>
        </div>
    </div>

import _ from "underscore";

const PermissionsGrid = ({ className, grid, onUpdatePermission, entityId, groupId }) => {
    const permissions = Object.entries(grid.permissions).map(([id, permission]) =>
        ({ id: id, ...permission })
    );
    return (
        <div className={className}>
            <AutoSizer>
                {({ height, width }) =>
                    <FixedHeaderGrid
                        height={height}
                        width={width}
                        rowCount={grid.entities.length}
                        columnCount={grid.groups.length}
                        columnWidth={Math.max(CELL_WIDTH, (width - 20 - HEADER_WIDTH) / grid.groups.length)}
                        rowHeight={CELL_HEIGHT}
                        paddingBottom={20}
                        paddingRight={20}
                        columnHeaderHeight={HEADER_HEIGHT}
                        rowHeaderWidth={HEADER_WIDTH}
                        renderCell={({ columnIndex, rowIndex }) =>
                            <PermissionsCell
                                group={grid.groups[columnIndex]}
                                permissions={permissions}
                                entity={grid.entities[rowIndex]}
                                onUpdatePermission={onUpdatePermission}
                                isFirstRow={rowIndex === 0}
                                isLastRow={rowIndex === grid.entities.length - 1}
                                isFirstColumn={columnIndex === 0}
                                isLastColumn={columnIndex === grid.groups.length - 1}
                                isFaded={
                                    (groupId != null && grid.groups[columnIndex].id !== groupId) ||
                                    (entityId != null && !_.isEqual(entityId, grid.entities[rowIndex].id))
                                }
                            />
                        }
                        renderColumnHeader={({ columnIndex }) =>
                            <GroupColumnHeader
                                group={grid.groups[columnIndex]}
                                permissions={permissions}
                                isFirstColumn={columnIndex === 0}
                                isLastColumn={columnIndex === grid.groups.length - 1}
                            />
                        }
                        renderRowHeader={({ rowIndex }) =>
                            <EntityRowHeader
                                icon={grid.icon}
                                entity={grid.entities[rowIndex]}
                                isFirstRow={rowIndex === 0}
                                isLastRow={rowIndex === grid.entities.length - 1}
                            />
                        }
                        renderCorner={() =>
                            <CornerHeader
                                grid={grid}
                            />
                        }
                    />
                }
            </AutoSizer>
        </div>
    );
}

export default PermissionsGrid;
