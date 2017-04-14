/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

import _ from "underscore";
import cx from "classnames";

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default class RecipientPicker extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            inputValue: "",
            filteredUsers: [],
            selectedUser: null,
            focused: props.recipients.length === 0
        };

        _.bindAll(this, "onMouseDownCapture", "onInputChange", "onInputKeyDown", "onInputFocus", "onInputBlur");
    }

    // TODO: use recipientTypes to limit the type of recipient that can be added

    static propTypes = {
        recipients: PropTypes.array,
        recipientTypes: PropTypes.array.isRequired,
        users: PropTypes.array,
        isNewPulse: PropTypes.bool.isRequired,
        onRecipientsChange: PropTypes.func.isRequired,
    };

    static defaultProps = {
        recipientTypes: ["user", "email"]
    };

    setInputValue(inputValue) {
        let { users, recipients } = this.props;
        let { selectedUser } = this.state;

        let recipientsById = {};
        for (let recipient of recipients) {
            if (recipient.id != null) {
                recipientsById[recipient.id] = recipient;
            }
        }

        let filteredUsers = [];
        if (inputValue) {
            // case insensitive search of name or email
            let inputValueLower = inputValue.toLowerCase()
            filteredUsers = users.filter(user =>
                !(user.id in recipientsById) &&
                (user.common_name.toLowerCase().indexOf(inputValueLower) >= 0 || user.email.toLowerCase().indexOf(inputValueLower) >= 0)
            );
        }

        if (selectedUser == null || !_.find(filteredUsers, (u) => u.id === selectedUser)) {
            if (filteredUsers.length > 0) {
                selectedUser = filteredUsers[0].id;
            } else {
                selectedUser = null;
            }
        }

        this.setState({ inputValue, filteredUsers, selectedUser });
    }

    onInputChange(e) {
        this.setInputValue(e.target.value);
    }

    onInputKeyDown(e) {
        // enter, tab, comma
        if (e.keyCode === 13 || e.keyCode === 9 || e.keyCode === 188) {
            this.addCurrentRecipient();
        }
        // up arrow
        else if (e.keyCode === 38) {
            e.preventDefault();
            let index = _.findIndex(this.state.filteredUsers, (u) => u.id === this.state.selectedUser);
            if (index > 0) {
                this.setState({ selectedUser: this.state.filteredUsers[index - 1].id });
            }
        }
        // down arrow
        else if (e.keyCode === 40) {
            e.preventDefault();
            let index = _.findIndex(this.state.filteredUsers, (u) => u.id === this.state.selectedUser);
            if (index >= 0 && index < this.state.filteredUsers.length - 1) {
                this.setState({ selectedUser: this.state.filteredUsers[index + 1].id });
            }
        }
        // backspace
        else if (e.keyCode === 8) {
            let { recipients } = this.props;
            if (!this.state.inputValue && recipients.length > 0) {
                this.removeRecipient(recipients[recipients.length - 1])
            }
        }
    }

    onInputFocus(e) {
        this.setState({ focused: true });
    }

    onInputBlur(e) {
        this.addCurrentRecipient();
        this.setState({ focused: false });
    }

    onMouseDownCapture(e) {
        let input = ReactDOM.findDOMNode(this.refs.input);
        input.focus();
        // prevents clicks from blurring input while still allowing text selection:
        if (input !== e.target) {
            e.preventDefault();
        }
    }

    addCurrentRecipient() {
        let input = ReactDOM.findDOMNode(this.refs.input);
        let user = _.find(this.state.filteredUsers, (u) => u.id === this.state.selectedUser);
        if (user) {
            this.addRecipient(user);
        } else if (VALID_EMAIL_REGEX.test(input.value)) {
            this.addRecipient({ email: input.value });
        }
    }

    addRecipient(recipient) {
        // recipient is a user object, or plain object containing "email" key
        this.props.onRecipientsChange(this.props.recipients.concat(recipient));
        this.setInputValue("");

        MetabaseAnalytics.trackEvent((this.props.isNewPulse) ? "PulseCreate" : "PulseEdit", "AddRecipient", (recipient.id) ? "user" : "email");
    }

    removeRecipient(recipient) {
        this.props.onRecipientsChange(this.props.recipients.filter(r => recipient.id != null ? recipient.id !== r.id : recipient.email !== r.email));

        MetabaseAnalytics.trackEvent((this.props.isNewPulse) ? "PulseCreate" : "PulseEdit", "RemoveRecipient", (recipient.id) ? "user" : "email");
    }

    render() {
        let { filteredUsers, selectedUser } = this.state;
        let { recipients } = this.props;

        return (
            <ul className={cx("px1 pb1 bordered rounded flex flex-wrap bg-white", { "input--focus": this.state.focused })} onMouseDownCapture={this.onMouseDownCapture}>
                {recipients.map((recipient, index) =>
                    <li key={index} className="mr1 py1 pl1 mt1 rounded bg-grey-1">
                        <span className="h4 text-bold">{recipient.common_name || recipient.email}</span>
                        <a className="text-grey-2 text-grey-4-hover px1" onClick={this.removeRecipient.bind(this, recipient)}>
                            <Icon name="close" className="" size={12} />
                        </a>
                    </li>
                )}
                <li className="flex-full mr1 py1 pl1 mt1 bg-white" style={{ "minWidth": " 100px" }}>
                    <input
                        ref="input"
                        type="text"
                        className="full h4 text-bold text-default no-focus borderless"
                        placeholder={recipients.length === 0 ? "Enter email addresses you'd like this data to go to" : null}
                        value={this.state.inputValue}
                        autoFocus={this.state.focused}
                        onKeyDown={this.onInputKeyDown}
                        onChange={this.onInputChange}
                        onFocus={this.onInputFocus}
                        onBlur={this.onInputBlur}
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
                                    className={cx("py1 px2 flex align-center text-bold bg-brand-hover text-white-hover", {
                                        "bg-grey-1": user.id === selectedUser
                                    })}
                                    onClick={this.addRecipient.bind(this, user)}
                                >
                                    <span className="text-white"><UserAvatar user={user} /></span>
                                    <span className="ml1 h4">{user.common_name}</span>
                                </li>
                            )}
                        </ul>
                    </Popover>
                </li>
            </ul>
        );
    }
}
