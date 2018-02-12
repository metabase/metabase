/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { findDOMNode } from "react-dom";
import _ from "underscore";
import cx from "classnames";
import { t } from "c-3po";

import OnClickOutsideWrapper from 'metabase/components/OnClickOutsideWrapper';
import Icon from "metabase/components/Icon";
import Input from "metabase/components/Input";
import Popover from "metabase/components/Popover";
import UserAvatar from "metabase/components/UserAvatar";

import MetabaseAnalytics from "metabase/lib/analytics";

import {
    KEYCODE_ESCAPE,
    KEYCODE_ENTER,
    KEYCODE_COMMA,
    KEYCODE_TAB,
    KEYCODE_UP,
    KEYCODE_DOWN,
    KEYCODE_BACKSPACE
} from "metabase/lib/keyboard";


const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default class RecipientPicker extends Component {
    constructor(props) {
        super(props);

        this.state = {
            inputValue: "",
            filteredUsers: [],
            selectedUserID: null,
            focused: props.autoFocus && props.recipients.length === 0
        };
    }

    // TODO: use recipientTypes to limit the type of recipient that can be added

    static propTypes = {
        recipients: PropTypes.array,
        recipientTypes: PropTypes.array.isRequired,
        users: PropTypes.array,
        isNewPulse: PropTypes.bool.isRequired,
        onRecipientsChange: PropTypes.func.isRequired,
        autoFocus: PropTypes.bool,
    };

    static defaultProps = {
        recipientTypes: ["user", "email"],
        autoFocus: true
    };

    setInputValue(inputValue) {
        const { users, recipients } = this.props;
        const searchString = inputValue.toLowerCase()

        let { selectedUserID } = this.state;
        let filteredUsers = [];


        let recipientsById = {};
        for (let recipient of recipients) {
            if (recipient.id != null) {
                recipientsById[recipient.id] = recipient;
            }
        }


        if (inputValue) {
            // case insensitive search of name or email
            filteredUsers = users.filter(user =>
                // filter out users who have already been selected
                !(user.id in recipientsById) &&
                (
                    user.common_name.toLowerCase().indexOf(searchString) >= 0 ||
                    user.email.toLowerCase().indexOf(searchString) >= 0
                )
            );
        }


        if (selectedUserID == null || !_.find(filteredUsers, (user) => user.id === selectedUserID)) {
            // if there are results based on the user's typing...
            if (filteredUsers.length > 0) {
                // select the first user in the list and set the ID to that
                selectedUserID = filteredUsers[0].id;
            } else {
                selectedUserID = null;
            }
        }

        this.setState({
            inputValue,
            filteredUsers,
            selectedUserID
        });
    }

    onInputChange = ({ target }) => {
        this.setInputValue(target.value);
    }

    // capture events on the input to allow for convenient keyboard shortcuts
    onInputKeyDown = (event) => {
        const keyCode = event.keyCode

        const { filteredUsers, selectedUserID } = this.state

        // enter, tab, comma
        if (keyCode === KEYCODE_ESCAPE || keyCode === KEYCODE_TAB || keyCode === KEYCODE_COMMA || keyCode === KEYCODE_ENTER) {
            this.addCurrentRecipient();
        }

        // up arrow
        else if (event.keyCode === KEYCODE_UP) {
            event.preventDefault();
            let index = _.findIndex(filteredUsers, (u) => u.id === selectedUserID);
            if (index > 0) {
                this.setState({ selectedUserID: filteredUsers[index - 1].id });
            }
        }

        // down arrow
        else if (keyCode === KEYCODE_DOWN) {
            event.preventDefault();
            let index = _.findIndex(filteredUsers, (u) => u.id === selectedUserID);
            if (index >= 0 && index < filteredUsers.length - 1) {
                this.setState({ selectedUserID: filteredUsers[index + 1].id });
            }
        }

        // backspace
        else if (keyCode === KEYCODE_BACKSPACE) {
            let { recipients } = this.props;
            if (!this.state.inputValue && recipients.length > 0) {
                this.removeRecipient(recipients[recipients.length - 1])
            }
        }
    }

    onInputFocus = () => {
        this.setState({ focused: true });
    }

    onInputBlur = () => {
        this.addCurrentRecipient();
        this.setState({ focused: false });
    }

    onMouseDownCapture = (e) => {
        let input = findDOMNode(this.refs.input);
        input.focus();
        // prevents clicks from blurring input while still allowing text selection:
        if (input !== e.target) {
            e.preventDefault();
        }
    }

    addCurrentRecipient() {
        let input = findDOMNode(this.refs.input);
        let user = _.find(this.state.filteredUsers, (u) => u.id === this.state.selectedUserID);
        if (user) {
            this.addRecipient(user);
        } else if (VALID_EMAIL_REGEX.test(input.value)) {
            this.addRecipient({ email: input.value });
        }
    }

    addRecipient = (recipient) => {
        const { recipients } = this.props

        // recipient is a user object, or plain object containing "email" key
        this.props.onRecipientsChange(
            // return the list of recipients with the new user added
            recipients.concat(recipient)
        );
        // reset the input value
        this.setInputValue("");

        MetabaseAnalytics.trackEvent(
            (this.props.isNewPulse) ? "PulseCreate" : "PulseEdit",
            "AddRecipient",
            (recipient.id) ? "user" : "email"
        );
    }

    removeRecipient(recipient) {
        const { recipients, onRecipientsChange } = this.props
        onRecipientsChange(
            recipients.filter(r =>
                recipient.id != null
                    ? recipient.id !== r.id
                    : recipient.email !== r.email
            )
        );

        MetabaseAnalytics.trackEvent(
            (this.props.isNewPulse) ? "PulseCreate" : "PulseEdit",
            "RemoveRecipient",
            (recipient.id) ? "user" : "email"
        );
    }

    render() {
        const { filteredUsers, inputValue, focused, selectedUserID } = this.state;
        const { recipients } = this.props;

        return (
            <OnClickOutsideWrapper handleDismissal={() => {
                this.setState({ focused: false });
            }}>
                <ul className={cx("px1 pb1 bordered rounded flex flex-wrap bg-white", { "input--focus": this.state.focused })} onMouseDownCapture={this.onMouseDownCapture}>
                    {recipients.map((recipient, index) =>
                        <li key={recipient.id} className="mr1 py1 pl1 mt1 rounded bg-grey-1">
                            <span className="h4 text-bold">{recipient.common_name || recipient.email}</span>
                            <a
                                className="text-grey-2 text-grey-4-hover px1"
                                onClick={() => this.removeRecipient(recipient)}
                            >
                                <Icon name="close" className="" size={12} />
                            </a>
                        </li>
                    )}
                    <li className="flex-full mr1 py1 pl1 mt1 bg-white" style={{ "minWidth": " 100px" }}>
                        <Input
                            ref="input"
                            className="full h4 text-bold text-default no-focus borderless"
                            placeholder={recipients.length === 0 ? t`Enter email addresses you'd like this data to go to` : null}
                            value={inputValue}
                            autoFocus={focused}
                            onKeyDown={this.onInputKeyDown}
                            onChange={this.onInputChange}
                            onFocus={this.onInputFocus}
                            onBlurChange={this.onInputBlur}
                        />
                        <Popover
                            isOpen={filteredUsers.length > 0}
                            hasArrow={false}
                            tetherOptions={{
                                attachment: "top left",
                                targetAttachment: "bottom left",
                                targetOffset: "10 0"
                            }}
                        >
                            <ul className="py1">
                                {filteredUsers.map(user =>
                                    <li
                                        key={user.id}
                                        className={cx(
                                            "py1 px2 flex align-center text-bold bg-brand-hover text-white-hover", {
                                            "bg-grey-1": user.id === selectedUserID
                                        })}
                                        onClick={() => this.addRecipient(user)}
                                    >
                                        <span className="text-white"><UserAvatar user={user} /></span>
                                        <span className="ml1 h4">{user.common_name}</span>
                                    </li>
                                )}
                            </ul>
                        </Popover>
                    </li>
                </ul>
            </OnClickOutsideWrapper>
        );
    }
}
