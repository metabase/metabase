import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import MetabaseSettings from "metabase/lib/settings";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { MODAL_EDIT_DETAILS,
         MODAL_INVITE_RESENT,
         MODAL_REMOVE_USER,
         MODAL_RESET_PASSWORD } from "./AdminPeople.jsx";
import { resendInvite, showModal } from "../actions";


export default class UserActionsSelect extends Component {

    static propTypes = {
        user: PropTypes.object.isRequired
    };

    onEditDetails() {
        this.props.dispatch(showModal({type: MODAL_EDIT_DETAILS, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onResendInvite() {
        this.props.dispatch(resendInvite(this.props.user));
        this.props.dispatch(showModal({type: MODAL_INVITE_RESENT, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onResetPassword() {
        if (window.OSX) {
            window.OSX.resetPassword();
            return;
        }

        this.props.dispatch(showModal({type: MODAL_RESET_PASSWORD, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onRemoveUser() {
        this.props.dispatch(showModal({type: MODAL_REMOVE_USER, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    render() {
        let { user } = this.props;

        return (
            <PopoverWithTrigger ref="popover"
                                className="block"
                                triggerElement={<span className="text-grey-1"><Icon name={'ellipsis'}></Icon></span>}>
                <ul className="UserActionsSelect">
                    <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onEditDetails.bind(this)}>Edit Details</li>

                    { (user.last_login === null && MetabaseSettings.isEmailConfigured()) ?
                        <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onResendInvite.bind(this)}>Re-send Invite</li>
                    :
                        <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onResetPassword.bind(this)}>Reset Password</li>
                    }

                    <li className="mt1 p2 border-top bg-error-hover text-error text-white-hover cursor-pointer"  onClick={this.onRemoveUser.bind(this)}>Remove</li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}
