/* eslint-disable react/display-name */

import React, { Component, PropTypes } from "react";

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

const PERMISSIONS_UI = {
    "native": {
        header: "SQL Queries"
    },
    "schemas": {
        header: "Data Access"
    },
    "tables": {
        header: "Data Access"
    },
    "fields": {
        header: "Data Access",
    }
};

const OPTIONS_UI = {
    "write": {
        title: "Write raw queries",
        tooltip: "Can write raw queries",
        icon: "sql",
        iconColor: "#9CC177",
        bgColor: "#F6F9F2"
    },
    "read": {
        title: "View raw queries",
        tooltip: "Can view raw queries",
        icon: "eye",
        iconColor: "#F9D45C",
        bgColor: "#FEFAEE"
    },
    "all": {
        title: "Grant unrestricted access",
        tooltip: "Unrestricted access",
        icon: "check",
        iconColor: "#9CC177",
        bgColor: "#F6F9F2"
    },
    "controlled": {
        title: "Limit access",
        tooltip: "Limited access",
        icon: "permissionsLimited",
        iconColor: "#F9D45C",
        bgColor: "#FEFAEE"
    },
    "none": {
        title: "Revoke access",
        tooltip: "No access",
        icon: "close",
        iconColor: "#EEA5A5",
        bgColor: "#FDF3F3"
    },
    "unknown": {
        icon: "unknown",
        iconColor: "#9BA5B1",
        bgColor: "#DFE8EA"
    }
}

const getOptionUi = (option) =>
    OPTIONS_UI[option] || { ...OPTIONS_UI.unknown, title: option };

const GroupColumnHeader = ({ group, permissions, isLastColumn, isFirstColumn }) =>
    <div className="absolute bottom left right">
        <h4 className="text-centered full my1">{ group.name }</h4>
        <div className="flex" style={getBorderStyles({ isLastColumn, isFirstColumn, isFirstRow: true, isLastRow: false })}>
            { permissions.map((permission, index) =>
                <div key={permission.id} className="flex-full py1 border-column-divider" style={{
                    borderColor: LIGHT_BORDER,
                }}>
                    <h5 className="text-centered text-grey-3 text-uppercase text-light">{permission.header}</h5>
                </div>
            )}
        </div>
    </div>

const PermissionsCell = ({ group, permissions, entity, onUpdatePermission, isLastRow, isLastColumn, isFirstColumn }) =>
    <div className="flex" style={getBorderStyles({ isLastRow, isLastColumn, isFirstColumn, isFirstRow: false })}>
        { permissions.map(permission =>
            <GroupPermissionCell
                key={permission.id}
                permission={permission}
                group={group}
                entity={entity}
                onUpdatePermission={onUpdatePermission}
                isEditable={group.editable}
            />
        )}
    </div>

class GroupPermissionCell extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            confirmText: null,
            confirmAction: null,
            hovered: false
        }
    }
    hoverEnter () {
        // only change the hover state if the group is not the admin
        // this helps indicate to users that the admin group is different
        if (this.props.group.name !== "Admin" ) {
            return this.setState({ hovered: true });
        }
        return false
    }
    hoverExit () {
        if (this.props.group.name !== "Admin" ) {
            return this.setState({ hovered: false });
        }
        return false
    }
    render() {
        const { permission, group, entity, onUpdatePermission } = this.props;

        const value = permission.getter(group.id, entity.id);
        const options = permission.options(group.id, entity.id);

        let isEditable = this.props.isEditable && options.filter(option => option !== value).length > 0;

        return (
                <PopoverWithTrigger
                    ref="popover"
                    disabled={!isEditable}
                    triggerClasses="cursor-pointer flex flex-full layout-centered border-column-divider"
                    triggerElement={
                        <Tooltip tooltip={getOptionUi(value).tooltip}>
                            <div
                                className={cx(
                                    'flex-full flex layout-centered',
                                    { 'cursor-pointer' : group.name !== 'Admin' },
                                    { 'disabled' : group.name === 'Admin'}
                                )}
                                style={{
                                    borderColor: LIGHT_BORDER,
                                    height: CELL_HEIGHT - 1,
                                    backgroundColor: this.state.hovered ? getOptionUi(value).iconColor : getOptionUi(value).bgColor,
                                }}
                                onMouseEnter={() => this.hoverEnter()}
                                onMouseLeave={() => this.hoverExit()}
                            >
                                <Icon
                                    name={getOptionUi(value).icon}
                                    size={28}
                                    style={{ color: this.state.hovered ? '#fff' : getOptionUi(value).iconColor }}
                                />
                                { this.state.confirmText &&
                                    <Modal>
                                        <ConfirmContent
                                            {...this.state.confirmText}
                                            onAction={this.state.confirmAction}
                                            onClose={() => this.setState({ confirmText: null, confirmAction: null })}
                                        />
                                    </Modal>
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
                            let confirmText = permission.confirm && permission.confirm(group.id, entity.id, value);
                            if (confirmText) {
                                this.setState({ confirmText, confirmAction });
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
        onClick={() => onChange(option)}
    >
        <Icon name={getOptionUi(option).icon} className="mr1" style={{ color: getOptionUi(option).iconColor }} size={18} />
        {getOptionUi(option).title}
    </div>

const AccessOptionList = ({ value, options, onChange }) =>
    <ul className="py1">
        { options.map(option => {
            if( value !== option ) {
                return (
                    <li key={option}>
                        <AccessOption value={value} option={option} onChange={onChange} />
                    </li>
               )
            }
        }
        )}
    </ul>

const EntityRowHeader = ({ entity, type }) =>
    <div
        className="flex flex-column justify-center px1 pl4 ml2"
        style={{
            height: CELL_HEIGHT
        }}
    >
        <div className="relative flex align-center">
            <Icon name={type} className="absolute" style={{ left: -28 }} />
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

const PermissionsGrid = ({ className, grid, onUpdatePermission }) => {
    const permissions = Object.entries(grid.permissions).map(([id, permission]) =>
        ({ id: id, ...PERMISSIONS_UI[id], ...permission })
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
                                type={grid.type}
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
