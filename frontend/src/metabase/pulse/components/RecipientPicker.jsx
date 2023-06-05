/* eslint "react/prop-types": "warn" */
import { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { recipientIsValid } from "metabase/lib/pulse";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import TokenField from "metabase/components/TokenField";
import UserAvatar from "metabase/components/UserAvatar";
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
            options={users ? users.map(user => ({ value: user })) : []}
            onChange={this.handleOnChange}
            placeholder={
              recipients.length === 0
                ? t`Enter user names or email addresses`
                : null
            }
            autoFocus={autoFocus && recipients.length === 0}
            multi
            valueRenderer={value => value.common_name ?? value.email}
            optionRenderer={option => (
              <div className="flex align-center">
                <span className="text-white">
                  <UserAvatar user={option.value} />
                </span>
                <span className="ml1">{option.value.common_name}</span>
              </div>
            )}
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
