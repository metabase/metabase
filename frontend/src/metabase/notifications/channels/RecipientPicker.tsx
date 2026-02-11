import cx from "classnames";
import { t } from "ttag";

import TokenField from "metabase/common/components/TokenField";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { isEmail } from "metabase/lib/email";
import {
  type RecipientPickerValue,
  recipientIsValid,
} from "metabase/lib/pulse";
import { Text } from "metabase/ui";
import type { User } from "metabase-types/api";

import S from "./RecipientPicker.module.css";
import { ErrorMessage } from "./RecipientPicker.styled";

interface RecipientPickerProps {
  recipients?: RecipientPickerValue[];
  users: User[];
  onRecipientsChange: (recipients: RecipientPickerValue[]) => void;
  autoFocus?: boolean;
  invalidRecipientText: (domains: string) => string;
}

export const RecipientPicker = ({
  recipients = [],
  users,
  onRecipientsChange,
  autoFocus = true,
  invalidRecipientText,
}: RecipientPickerProps) => {
  const handleOnChange = (newRecipients: RecipientPickerValue[]) => {
    onRecipientsChange(newRecipients);
  };

  const isValid = recipients.every((r) => recipientIsValid(r));
  const domains = useSetting("subscription-allowed-domains");

  return (
    <div>
      <div>
        <TokenField
          value={recipients}
          options={users ? users.map((user) => ({ value: user })) : []}
          onChange={handleOnChange}
          className={S.tokenField}
          idKey={(item: RecipientPickerValue) =>
            "id" in item ? String(item.id) : item.email
          }
          placeholder={
            recipients.length === 0
              ? t`Enter user names or email addresses`
              : undefined
          }
          autoFocus={autoFocus && recipients.length === 0}
          multi
          valueRenderer={(value) => value.common_name ?? value.email}
          optionRenderer={(option) => (
            <div className={cx(CS.flex, CS.alignCenter)}>
              <Text color="text-primary-inverse">
                <UserAvatar user={option.value} />
              </Text>
              <span className={CS.ml1}>{option.value.common_name}</span>
            </div>
          )}
          filterOption={filterOption}
          validateValue={(value) => recipientIsValid(value)}
          parseFreeformValue={(inputValue) => {
            if (isEmail(inputValue)) {
              return { email: inputValue };
            }
          }}
          updateOnInputBlur
        />
      </div>
      {domains && !isValid && (
        <ErrorMessage>{invalidRecipientText(domains)}</ErrorMessage>
      )}
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
