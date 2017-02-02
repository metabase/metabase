/* @flow */

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import CopyToClipboard from 'react-copy-to-clipboard';

type Props = {
    value: string
};
type State = {
    copied: boolean
};

export default class CopyWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            copied: false
        }
    }
    onCopy = () => {
        this.setState({ copied: true });
        setTimeout(() =>
            this.setState({ copied: false })
        , 2000);
    }
    render() {
        const { value } = this.props;
        return (
            <div className="flex">
                <input
                    className="flex-full p1 flex align-center text-grey-4 text-bold no-focus border-top border-left border-bottom border-med rounded-left"
                    style={{ borderRight: "none" }}
                    type="text"
                    value={value}
                    onClick={(e) => e.target.setSelectionRange(0, e.target.value.length)}
                />
                <Tooltip tooltip="Copied!" isOpen={this.state.copied}>
                    <CopyToClipboard text={value} onCopy={this.onCopy}>
                        <div className="p1 flex align-center bordered border-med rounded-right text-brand bg-brand-hover text-white-hover">
                            <Icon name="copy" />
                        </div>
                    </CopyToClipboard>
                </Tooltip>
            </div>
        );
    }
}
