// @flow

import React, { Component, PropTypes } from "react";

import Button from "metabase/components/Button";
// import Modal from "metabase/components/Modal.jsx";

type Props = {
    updateSetting: (value: boolean) => void,
    setting: {}
};

export default class LdapGroupMappingsWidget extends Component<*, Props, *> {
    props: Props;

    render() {
        return <Button className="ml1" primary medium>Edit Mappings</Button>;
    }
}
