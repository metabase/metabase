import { t } from "ttag";

import { UserAvatar } from "metabase/common/components/UserAvatar";
import { useSetting } from "metabase/common/hooks";
import { type RecipientPickerValue, recipientIsValid } from "metabase/pulse";
import { Flex, MultiAutocomplete, Text } from "metabase/ui";
import { isEmail } from "metabase/utils/email";
import type { User } from "metabase-types/api";

import S from "./RecipientPicker.module.css";

interface RecipientPickerProps {
  recipients?: RecipientPickerValue[];
  users: User[];
  onRecipientsChange: (recipients: RecipientPickerValue[]) => void;
  autoFocus?: boolean;
  invalidRecipientText: (domains: string) => string;
}

const recipientKey = (recipient: RecipientPickerValue) =>
  "id" in recipient ? String(recipient.id) : recipient.email;

export const RecipientPicker = ({
  recipients = [],
  users,
  onRecipientsChange,
  autoFocus = true,
  invalidRecipientText,
}: RecipientPickerProps) => {
  const userByKey = new Map(users.map((user) => [recipientKey(user), user]));
  const recipientByKey = new Map(
    recipients.map((recipient) => [recipientKey(recipient), recipient]),
  );

  const handleChange = (keys: string[]) => {
    onRecipientsChange(
      keys.map(
        (key) =>
          userByKey.get(key) ?? recipientByKey.get(key) ?? { email: key },
      ),
    );
  };

  const isValid = recipients.every((recipient) => recipientIsValid(recipient));
  const domains = useSetting("subscription-allowed-domains");

  return (
    <div>
      <div>
        <MultiAutocomplete
          data-testid="token-field"
          classNames={{ input: S.tokenField }}
          value={recipients.map(recipientKey)}
          data={users.map((user) => ({
            value: recipientKey(user),
            label: user.common_name ?? user.email ?? "",
          }))}
          onChange={handleChange}
          placeholder={
            recipients.length === 0
              ? t`Enter user names or email addresses`
              : undefined
          }
          autoFocus={autoFocus && recipients.length === 0}
          rightSection={null}
          parseValue={(rawValue) => {
            const value = rawValue.trim();
            return isEmail(value) ? value : null;
          }}
          filter={({ options, search }) =>
            options.filter((option) => {
              if ("items" in option) {
                return true;
              }
              const user = userByKey.get(option.value);
              return (
                includesIgnoreCase(option.label, search) ||
                includesIgnoreCase(user?.email ?? "", search)
              );
            })
          }
          renderValue={({ value }) => {
            const recipient = userByKey.get(value) ?? recipientByKey.get(value);
            if (!recipient) {
              return value;
            }
            return "id" in recipient
              ? (recipient.common_name ?? recipient.email)
              : recipient.email;
          }}
          renderOption={({ option }) => {
            const user = userByKey.get(option.value);
            if (!user) {
              return option.label;
            }
            return (
              <Flex align="center" gap="sm">
                <Text c="text-primary-inverse">
                  <UserAvatar user={user} />
                </Text>
                <span>{user.common_name}</span>
              </Flex>
            );
          }}
        />
      </div>
      {domains && !isValid && (
        <div className={S.ErrorMessage}>{invalidRecipientText(domains)}</div>
      )}
    </div>
  );
};

const includesIgnoreCase = (sourceText: string, searchText: string) =>
  sourceText.toLowerCase().includes(searchText.toLowerCase());
