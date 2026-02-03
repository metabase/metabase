import { type FocusEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { useListUserRecipientsQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { isEmail } from "metabase/lib/email";
import { Avatar, Flex, Icon, Select, type SelectProps } from "metabase/ui";
import type { User, UserId } from "metabase-types/api";
interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  email: string | null;
  userId: UserId | "unknown" | null;
  onEmailChange: (email: string) => void;
  onUserIdChange: (value: UserId | "unknown" | null) => void;
  unknownUserLabel?: string;
}

export const UserInput = ({
  comboboxProps,
  email,
  userId,
  onEmailChange,
  onFocus,
  onUserIdChange,
  unknownUserLabel = t`Unspecified`,
  ...props
}: Props) => {
  const [search, setSearch] = useState(email ?? "");
  const { data: usersData } = useListUserRecipientsQuery();
  const users = useMemo(() => usersData?.data ?? [], [usersData]);
  const data = useMemo(
    () => getData(search, users, unknownUserLabel),
    [search, unknownUserLabel, users],
  );

  const userName = useMemo(() => {
    if (userId == null) {
      return undefined;
    }

    return users.find((user) => user.id === userId)?.common_name;
  }, [users, userId]);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
    onFocus?.(event);
  };

  const handleChange = (value: string | null) => {
    if (value == null) {
      onUserIdChange(null);
      return;
    }

    const newValue = parseValue(value);

    if (typeof newValue === "number" || newValue === "unknown") {
      onUserIdChange(newValue);
    } else {
      onEmailChange(value);
    }
  };

  return (
    <Select<string | null>
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={data}
      leftSection={
        userName ? (
          <Avatar name={userName} />
        ) : email ? (
          <Avatar color="initials" name="emails">
            <Icon name="mail" />
          </Avatar>
        ) : userId === "unknown" ? (
          <Avatar color="background-secondary" name="unknown">
            <Icon name="person" c="text-secondary" />
          </Avatar>
        ) : null
      }
      placeholder={t`Pick someone, or type an email`}
      nothingFoundMessage={t`Didn't find any results`}
      searchable
      searchValue={search}
      renderOption={(item) => {
        const option = item.option as Option;
        return (
          <Flex align="center" gap="sm" p="sm" w="100%">
            {option.type === "user" && <Avatar name={item.option.label} />}
            {option.type === "unknown" && (
              <Avatar color="background-secondary">
                <Icon name="person" c="text-secondary" />
              </Avatar>
            )}
            {option.type === "email" && (
              <Avatar color="initials" name="emails">
                <Icon name="mail" />
              </Avatar>
            )}
            <Ellipsified>{item.option.label}</Ellipsified>
          </Flex>
        );
      }}
      value={email ? email : userId ? String(userId) : null}
      onChange={handleChange}
      onFocus={handleFocus}
      onSearchChange={setSearch}
      {...props}
    />
  );
};

type Option = {
  label: string;
  value: string;
  disabled?: boolean;
  type: "email" | "user" | "unknown";
};

function getData(
  email: string | null,
  users: User[],
  unknownUserLabel?: string,
): Option[] {
  return [
    {
      label: unknownUserLabel ?? t`Unspecified`,
      value: "unknown",
      type: "unknown" as const,
    },
    ...users.map((user) => ({
      label: user.common_name,
      value: stringifyValue(user.id) as string,
      type: "user" as const,
    })),
    email == null || email.trim().length === 0
      ? null
      : {
          label: email,
          value: email,
          disabled: !isEmail(email),
          type: "email" as const,
        },
  ].filter((option) => option != null);
}

function stringifyValue(value: UserId | "unknown" | null): string | null {
  return value === null ? null : String(value);
}

function parseValue(value: string): UserId | string | "unknown" {
  if (value === "unknown") {
    return "unknown";
  }

  if (isEmail(value)) {
    return value;
  }

  return parseInt(value, 10);
}
