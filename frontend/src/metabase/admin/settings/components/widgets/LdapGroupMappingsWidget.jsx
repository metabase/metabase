// @flow

import React, { Component, PropTypes } from "react";

import Button from "metabase/components/Button";
import GroupSelect from "metabase/admin/people/components/GroupSelect";
import GroupSummary from "metabase/admin/people/components/GroupSummary";
import Icon from "metabase/components/Icon.jsx";
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
    showModal: boolean,
    groups: Object[],
    newMapping: string,
    mappings: { [string]: number[] },
    error: any
};

export default class LdapGroupMappingsWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props, context) {
        super(props, context);
        this.state = {
            showModal: false,
            groups: [],
            newMapping: '',
            mappings: {},
            error: null
        };
    }

    _editMappingsClick = async (e) => {
        e.preventDefault();
        let groups = await PermissionsApi.groups();
        this.setState({ showModal: true, groups });
    }

    _addMappingClick = () => {
        const { newMapping } = this.state;
        this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [newMapping]: [] }, newMapping: '' }));
    }

    _mappingGroupChange = (dn: string) => (group, selected) => {
        if (selected) {
            this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [dn]: [...prevState.mappings[dn], group.id] } }));
        } else {
            this.setState((prevState: State) => ({ mappings: { ...prevState.mappings, [dn]: prevState.mappings[dn].filter(id => id !== group.id) } }));
        }
    }

    _deleteMappingClick = (dn: string) => (e) => {
        e.preventDefault();
        this.setState((prevState: State) => ({ mappings: _.omit(prevState.mappings, dn) }));
    }

    _cancelClick = (e) => {
        e.preventDefault();
        this.setState({ showModal: false });
    }

    _saveClick = (e) => {
        e.preventDefault();
        this.setState({ showModal: false });
    }

    render() {
        const { showModal, groups, newMapping, mappings } = this.state;

        let isAddValid = newMapping && !mappings[newMapping];

        return (
            <div className="flex align-center">
                <SettingToggle {...this.props} />
                <Button className="ml1" primary medium onClick={this._editMappingsClick}>Edit Mappings</Button>
                { showModal ? (
                    <Modal wide>
                        <div className="p4">
                            <h2>Edit Mappings</h2>
                            <table className="ContentTable">
                                <thead>
                                    <tr>
                                        <th>Distinguished Name</th>
                                        <th>Groups</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td colSpan="3" style={{ padding: 0 }}>
                                            <div className="my2 pl1 p1 bordered border-brand rounded relative flex align-center">
                                                <input
                                                    className="input--borderless h3 ml1 flex-full"
                                                    type="text"
                                                    value={newMapping}
                                                    placeholder="cn=People,ou=Groups,dc=metabase,dc=com"
                                                    autoFocus
                                                    onChange={(e) => this.setState({newMapping: e.target.value})}
                                                />
                                                <Button className="ml2" primary={!!isAddValid} disabled={!isAddValid} onClick={this._addMappingClick}>Add</Button>
                                            </div>
                                        </td>
                                    </tr>
                                    { Object.entries(mappings).map(([dn, ids]) => {
                                        let selected = ids.reduce((g, id) => ({ ...g, [id]: true }), {});
                                        return (
                                            <tr key={dn}>
                                                <td>{dn}</td>
                                                <td>
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
                                                        <GroupSelect groups={groups} selectedGroups={selected} onGroupChange={this._mappingGroupChange(dn)} />
                                                    </PopoverWithTrigger>
                                                </td>
                                                <td className="Table-actions">
                                                    <Button warning onClick={this._deleteMappingClick(dn)}>Remove</Button>
                                                </td>
                                            </tr>
                                        );
                                    }) }
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
