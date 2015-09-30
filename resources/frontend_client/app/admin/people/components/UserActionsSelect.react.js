"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";

import { deleteUser, showEditDetailsModal } from "../actions";


export default class UserActionsSelect extends Component {

    constructor(props) {
        super(props);

        this.styles = {
            menuList: {
                minWidth: "90px"
            }
        };
    }

    onEditDetails() {
        this.props.dispatch(showEditDetailsModal(this.props.user));
        this.refs.popover.toggle();
    }

    onResendInvite() {

    }

    onResetPassword() {

    }

    onRemoveUser() {
        this.props.dispatch(deleteUser(this.props.user));
        this.refs.popover.toggle();
    }

    render() {
        let { user } = this.props;

        var triggerElement = (
            <span className="text-grey-1"><Icon name={'ellipsis'}></Icon></span>
        );

        var tetherOptions = {
            attachment: 'top right',
            targetAttachment: 'bottom right',
            targetOffset: '5px 0',
            constraints: [{ to: 'window', attachment: 'together', pin: ['top', 'bottom']}]
        };

        return (
            <PopoverWithTrigger ref="popover"
                                className={"PopoverBody PopoverBody--withArrow block"}
                                tetherOptions={tetherOptions}
                                triggerElement={triggerElement}>
                <ul className="UserActionsSelect">
                    <li onClick={this.onEditDetails.bind(this)}>Edit Details</li>
                    { user.last_login === null ?
                        <li onClick={this.onResendInvite.bind(this)}>Re-send Invite</li>
                    :
                        <li onClick={this.onResetPassword.bind(this)}>Reset Password</li>
                    }
                    <li className="Remove" onClick={this.onRemoveUser.bind(this)}>Remove</li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}

UserActionsSelect.propTypes = {
    user: React.PropTypes.object.isRequired
};
