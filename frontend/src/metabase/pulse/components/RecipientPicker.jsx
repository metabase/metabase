/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { recipientIsValid } from "metabase/lib/pulse";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import TokenField from "metabase/components/TokenField";
import UserAvatar from "metabase/components/UserAvatar/UserAvatar";
import { ErrorMessage } from "./RecipientPicker.styled";

export default class RecipientPicker extends Component {
  static propTypes = {
    recipients: PropTypes.array,
    recipientTypes: PropTypes.array.isRequired,
    users: PropTypes.array,
    isNewPulse: PropTypes.bool.isRequired,
    onRecipientsChange: PropTypes.func.isRequired,
    autoFocus: PropTypes.bool,
    invalidRecipientText: PropTypes.func.isRequired,
  };

  static defaultProps = {
    recipientTypes: ["user", "email"],
    autoFocus: true,
  };

  handleOnChange = newRecipients => {
    this.props.onRecipientsChange(newRecipients);
    this._trackChange(newRecipients);
  };

  _trackChange(newRecipients) {
    const { recipients, isNewPulse } = this.props;

    // kind of hacky way to find the changed recipient
    const previous = new Set(recipients.map(r => JSON.stringify(r)));
    const next = new Set(newRecipients.map(r => JSON.stringify(r)));
    const recipient =
      [...next].filter(r => !previous.has(r))[0] ||
      [...previous].filter(r => !next.has(r))[0];

    MetabaseAnalytics.trackStructEvent(
      isNewPulse ? "PulseCreate" : "PulseEdit",
      newRecipients.length > recipients.length
        ? "AddRecipient"
        : "RemoveRecipient",
      recipient && (recipient.id ? "user" : "email"),
    );
  }

  render() {
    const { recipients, users, autoFocus, invalidRecipientText } = this.props;
    const isValid = recipients.every(r => recipientIsValid(r));
    const domains = MetabaseSettings.subscriptionAllowedDomains().join(", ");

    return (
      <div>
        <div className="bordered rounded" style={{ padding: "2px" }}>
          <TokenField
            value={recipients}
            options={
              users
                ? // `label` here isn't really used because we specify `filterOption`.
                  // Normally, `options` will be filtered by its `label` if we don't provide
                  // `filterOption` to <TokenField />.
                  users.map(user => ({ value: user }))
                : []
            }
            onChange={this.handleOnChange}
            placeholder={
              recipients.length === 0
                ? t`Enter user names or email addresses`
                : null
            }
            autoFocus={autoFocus && recipients.length === 0}
            multi
            // https://user-images.githubusercontent.com/1937582/172163846-86636488-9cb7-4b8f-9609-594b42384f4a.png
            valueRenderer={value => value.common_name}
            optionRenderer={option => (
              <div className="flex align-center">
                <span className="text-white">
                  <UserAvatar user={option.value} />
                </span>
                {/* https://user-images.githubusercontent.com/1937582/172163846-86636488-9cb7-4b8f-9609-594b42384f4a.png */}
                <span className="ml1">{option.value.common_name}</span>
              </div>
            )}
            // Just a note, but I think logic that filter options by either common_name or email might already work.
            // But making this close to what we have in UserPicker would be better because that one is more readable.
            filterOption={filterOption}
            validateValue={value => recipientIsValid(value)}
            parseFreeformValue={inputValue => {
              if (MetabaseUtils.isEmail(inputValue)) {
                return { email: inputValue };
              }
            }}
            updateOnInputBlur
          />
        </div>
        {!isValid && (
          <ErrorMessage>{invalidRecipientText(domains)}</ErrorMessage>
        )}
      </div>
    );
  }
}

const filterOption = (option, text) => {
  return (
    includesIgnoreCase(option.value.common_name, text) ||
    includesIgnoreCase(option.value.email, text)
  );
};

const includesIgnoreCase = (sourceText, searchText) => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};
