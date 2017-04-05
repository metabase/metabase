// @flow

import React, { Component, PropTypes } from "react";

import Button from "metabase/components/Button";
import GroupSelect from "metabase/admin/people/components/GroupSelect";
import GroupSummary from "metabase/admin/people/components/GroupSummary";
import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Modal from "metabase/components/Modal";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { PermissionsApi } from "metabase/services";

import _ from "underscore";

import SettingToggle from './SettingToggle';

type Props = {
    updateSetting: (value: any) => void,
    setting: any
};

type State = {
    showEditModal: boolean,
    groups: Object[],
    mappings: { [string]: number[] },
    error: any
};

export default class LdapGroupMappingsWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props, context) {
        super(props, context);
        this.state = {
            showEditModal: false,
            showAddRow: false,
            groups: [],
            mappings: {},
            error: null
        };
    }

    _showEditModal = (e) => {
        e.preventDefault();
        this.setState({ showEditModal: true });
        PermissionsApi.groups().then((groups) => this.setState({ groups }));
    }

    _showAddRow = (e) => {
        e.preventDefault();
        this.setState({ showAddRow: true });
    }

    _hideAddRow = (e) => {
        this.setState({ showAddRow: false });
    }

    _addMapping = (dn) => {
        this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [dn]: [] }, showAddRow: false }));
    }

    _changeMapping = (dn: string) => (group, selected) => {
        if (selected) {
            this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [dn]: [...prevState.mappings[dn], group.id] } }));
        } else {
            this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [dn]: prevState.mappings[dn].filter(id => id !== group.id) } }));
        }
    }

    _deleteMapping = (dn: string) => (e) => {
        e.preventDefault();
        this.setState((prevState: State) => ({ mappings: _.omit(prevState.mappings, dn) }));
    }

    _cancelClick = (e) => {
        e.preventDefault();
        this.setState({ showEditModal: false, showAddRow: false });
    }

    _saveClick = (e) => {
        e.preventDefault();
        this.setState({ showEditModal: false, showAddRow: false });
    }

    render() {
        const { showEditModal, showAddRow, groups, mappings } = this.state;

        return (
            <div className="flex align-center">
                <SettingToggle {...this.props} />
                <Button className="ml1" primary medium onClick={this._showEditModal}>Edit Mappings</Button>
                { showEditModal ? (
                    <Modal wide>
                        <div className="p4">
                            <h2>Group Mappings</h2>
                            <Button className="float-right" primary onClick={this._showAddRow}>Create a mapping</Button>
                            <p className="text-measure">
                                Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the
                                directory server. Note however that membership to the Admin group can be granted through mappings, but will never be
                                automatically revoked as a failsafe measure.
                            </p>
                            <table className="ContentTable">
                                <thead>
                                    <tr>
                                        <th>Distinguished Name</th>
                                        <th>Groups</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { showAddRow ? (
                                        <AddMappingRow mappings={mappings} onCancel={this._hideAddRow} onAdd={this._addMapping} />
                                    ) : null }
                                    { Object.entries(mappings).map(([dn, ids]) =>
                                        <MappingRow
                                            key={dn}
                                            dn={dn}
                                            groups={groups}
                                            selectedIds={ids}
                                            onChange={this._changeMapping(dn)}
                                            onDelete={this._deleteMapping(dn)}
                                        />
                                    ) }
                                </tbody>
                            </table>
                            <div className="py1">
                                <Button borderless onClick={this._cancelClick}>Cancel</Button>
                                <Button className="ml1" primary onClick={this._saveClick}>Save</Button>
                            </div>
                        </div>
                    </Modal>
                ) : null }
            </div>
        );
    }
}

class AddMappingRow extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            value: ''
        };
    }

    _handleCancelClick = (e) => {
        const { onCancel } = this.props;
        e.preventDefault();
        this.setState({ value: '' });
        onCancel && onCancel();
    }

    _handleAddClick = (e) => {
        const { state: { value }, props: { onAdd } } = this;
        e.preventDefault();
        this.setState({ value: '' });
        onAdd && onAdd(value);
    }

    render() {
        const { state: { value }, props: { mappings } } = this;

        let isValid = value && !mappings[value];

        return (
            <tr>
                <td colSpan="3" style={{ padding: 0 }}>
                    <div className="my2 pl1 p1 bordered border-brand rounded relative flex align-center">
                        <input
                            className="input--borderless h3 ml1 flex-full"
                            type="text"
                            value={value}
                            placeholder="cn=People,ou=Groups,dc=metabase,dc=com"
                            autoFocus
                            onChange={(e) => this.setState({value: e.target.value})}
                        />
                        <span className="link no-decoration cursor-pointer" onClick={this._handleCancelClick}>Cancel</span>
                        <Button className="ml2" primary={!!isValid} disabled={!isValid} onClick={this._handleAddClick}>Add</Button>
                    </div>
                </td>
            </tr>
        );
    }
}

const MappingGroupSelect = ({ groups, selectedIds = {}, onGroupChange }) => {
    let selected = selectedIds.reduce((g, id) => ({ ...g, [id]: true }), {});

    if (!groups || groups.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <PopoverWithTrigger
            ref="popover"
            triggerElement={
                <div className="flex align-center">
                    <span className="mr1 text-grey-4">
                        <GroupSummary groups={groups} selectedGroups={selected} />
                    </span>
                    <Icon className="text-grey-2" name="chevrondown"  size={10}/>
                </div>
            }
            triggerClasses="AdminSelectBorderless py1"
            sizeToFit
        >
            <GroupSelect groups={groups} selectedGroups={selected} onGroupChange={onGroupChange} />
        </PopoverWithTrigger>
    );
}

const MappingRow = ({ dn, groups, selectedIds, onChange, onDelete }) => {
    return (
        <tr>
            <td>{dn}</td>
            <td>
                <MappingGroupSelect
                    groups={groups}
                    selectedIds={selectedIds}
                    onGroupChange={onChange}
                />
            </td>
            <td className="Table-actions">
                <Button warning onClick={onDelete}>Remove</Button>
            </td>
        </tr>
    );
}
