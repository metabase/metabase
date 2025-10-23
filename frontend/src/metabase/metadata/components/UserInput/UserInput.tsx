import { type FocusEvent, useMemo } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { isEmail } from "metabase/lib/email";
import { Avatar, Group, Select, type SelectProps } from "metabase/ui";
import type { User, UserId } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  email: string | null;
  userId: UserId | null;
  onEmailChange: (email: string | null) => void;
  onUserIdChange: (value: UserId | null) => void;
}

export const UserInput = ({
  comboboxProps,
  email,
  userId,
  onEmailChange,
  onFocus,
  onUserIdChange,
  ...props
}: Props) => {
  const { data: usersData } = useListUsersQuery();
  const users = useMemo(() => usersData?.data ?? [], [usersData]);
  const data = useMemo(() => getData(email, users), [email, users]);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
    onFocus?.(event);
  };

  const handleChange = (value: string) => {
    const newValue = parseValue(value);

    if (typeof newValue === "number" || newValue === null) {
      onUserIdChange(newValue);
    } else {
      onEmailChange(newValue);
    }
  };

  return (
    <Select
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
      placeholder={t`Choose user or type an email`}
      nothingFoundMessage={t`Didn't find any results`}
      searchable
      renderOption={(item) => {
        return (
          <Group gap="sm" p="sm">
            <Avatar
              name={
                item.option.value === stringifyValue(null)
                  ? t`?`
                  : item.option.label
              }
            />

            <span>{item.option.label}</span>
          </Group>
        );
      }}
      value={email ? email : stringifyValue(userId)}
      onChange={handleChange}
      onFocus={handleFocus}
      {...props}
    />
  );
};

function getData(email: string | null, users: User[]) {
  return [
    email == null
      ? null
      : {
          label: email,
          value: email,
          disabled: !isEmail(email),
        },
    { label: t`Unknown`, value: stringifyValue(null) },
    ...users.map((user) => ({
      label: user.common_name,
      value: stringifyValue(user.id),
    })),
  ].filter((option) => option != null);
}

function stringifyValue(value: UserId | string | null): string {
  return value === null ? "null" : String(value);
}

function parseValue(value: string): UserId | string | null {
  if (value === "null") {
    return null;
  }

  if (isEmail(value)) {
    return value;
  }

  return parseInt(value, 10);
}
