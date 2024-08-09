import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import TokenField from "metabase/components/TokenField";
import UserAvatar from "metabase/components/UserAvatar";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { isEmail } from "metabase/lib/email";
import { recipientIsValid } from "metabase/lib/pulse";
import MetabaseSettings from "metabase/lib/settings";
import { Text } from "metabase/ui";
import type { User } from "metabase-types/api";

import { ErrorMessage } from "./RecipientPicker.styled";

interface RecipientPickerProps {
  recipients?: User[];
  users: User[];
  isNewPulse: boolean;
  onRecipientsChange: (recipients: User[]) => void;
  autoFocus?: boolean;
  invalidRecipientText: (domains: string) => string;
}

export const RecipientPicker = ({
  recipients = [],
  users,
  isNewPulse,
  onRecipientsChange,
  autoFocus = true,
  invalidRecipientText,
}: RecipientPickerProps) => {
  const handleOnChange = (newRecipients: User[]) => {
    onRecipientsChange(newRecipients);
    _trackChange(newRecipients);
  };

  const _trackChange = (newRecipients: User[]) => {
    const isAddition = newRecipients.length > recipients.length;

    const recipient = isAddition
      ? _.difference(newRecipients, recipients)[0]
      : _.difference(recipients, newRecipients)[0];

    MetabaseAnalytics.trackStructEvent(
      isNewPulse ? "PulseCreate" : "PulseEdit",
      isAddition ? "AddRecipient" : "RemoveRecipient",
      recipient && (recipient.id ? "user" : "email"),
    );
  };

  const isValid = recipients.every(r => recipientIsValid(r));
  const domains = MetabaseSettings.subscriptionAllowedDomains().join(", ");

  return (
    <div>
      <div style={{ padding: "2px" }}>
        <TokenField
          value={recipients}
          options={users ? users.map(user => ({ value: user })) : []}
          onChange={handleOnChange}
          placeholder={
            recipients.length === 0
              ? t`Enter user names or email addresses`
              : undefined
          }
          autoFocus={autoFocus && recipients.length === 0}
          multi
          valueRenderer={value => value.common_name ?? value.email}
          optionRenderer={option => (
            <div className={cx(CS.flex, CS.alignCenter)}>
              <Text color="text-white">
                <UserAvatar user={option.value} />
              </Text>
              <span className={CS.ml1}>{option.value.common_name}</span>
            </div>
          )}
          filterOption={filterOption}
          validateValue={value => recipientIsValid(value)}
          parseFreeformValue={inputValue => {
            if (isEmail(inputValue)) {
              return { email: inputValue };
            }
          }}
          updateOnInputBlur
        />
      </div>
      {!isValid && <ErrorMessage>{invalidRecipientText(domains)}</ErrorMessage>}
    </div>
  );
};

const filterOption = (option: any, text: string) => {
  return (
    includesIgnoreCase(option.value.common_name, text) ||
    includesIgnoreCase(option.value.email, text)
  );
};

const includesIgnoreCase = (sourceText: string, searchText: string) => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};
