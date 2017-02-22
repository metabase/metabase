/* @flow */

import React, { Component, PropTypes } from "react";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";

import EmbedModalContent from "./EmbedModalContent";

import cx from "classnames";

type Props = {
    className?: string,
    resourceType: string
};

export default class EmbedWidget extends Component<*, Props, *> {
    props: Props;

    _modal: ?ModalWithTrigger

    render() {
        const { className, resourceType } = this.props;
        return (
            <ModalWithTrigger
                ref={m => this._modal = m}
                full
                triggerElement={
                    <Tooltip tooltip={`Share this ${resourceType}`}>
                        <Icon name="share" />
                    </Tooltip>
                }
                triggerClasses={cx(className, "text-brand-hover")}
                className="scroll-y"
            >
                <EmbedModalContent
                    {...this.props}
                    onClose={() => this._modal && this._modal.close()}
                    className="full-height"
                />
            </ModalWithTrigger>
        );
    }
}
