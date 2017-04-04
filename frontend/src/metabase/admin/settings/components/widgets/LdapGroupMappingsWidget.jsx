// @flow

import React, { Component, PropTypes } from "react";

import Button from "metabase/components/Button";
import Confirm from "metabase/components/Confirm";
import Modal from "metabase/components/Modal";

import SettingToggle from './SettingToggle';

type Props = {

};

type State = {
    showModal: boolean,
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
            mappings: {},
            error: null
        };
    }

    render() {
        const { mappings, showModal } = this.state;

        return (
            <div className="flex align-center">
                <SettingToggle {...this.props} />
                <Button className="ml1" primary medium onClick={(e) => { e.preventDefault(); this.setState({showModal: true}); }}>Edit Mappings</Button>
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
                                    {Object.entries(mappings).map(([dn, groups]) =>
                                        <tr key={dn}>
                                            <td>{dn}</td>
                                            <td>{groups.reduce({}, (m, id) => ({ ...m, [id]: true })) /* TODO */}</td>
                                            <td className="Table-actions">
                                                <Confirm action={() => null} title="Delete custom map">
                                                    <Button danger>Remove</Button>
                                                </Confirm>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            <div className="py1">
                                <Button borderless onClick={(e) => { e.preventDefault(); this.setState({showModal: false}); }}>Cancel</Button>
                                <Button className="ml1" primary>Save</Button>
                            </div>
                        </div>
                    </Modal>
                ) : null }
            </div>
        );
    }
}
