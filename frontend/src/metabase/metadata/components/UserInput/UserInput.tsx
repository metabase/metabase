import { type FocusEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { isEmail } from "metabase/lib/email";
import { Avatar, Group, Select, type SelectProps, Text } from "metabase/ui";
import type { User, UserId } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  email: string | null | undefined;
  userId: UserId | null | undefined;
  onEmailChange: (email: string) => void;
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
  const [search, setSearch] = useState(email ?? "");
  const { data: usersData } = useListUsersQuery();
  const users = useMemo(() => usersData?.data ?? [], [usersData]);
  const data = useMemo(() => getData(search, users), [search, users]);

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
      placeholder={t`Select user or type an email`}
      nothingFoundMessage={t`Didn't find any results`}
      searchable
      searchValue={search}
      renderOption={(item) => {
        const option = item.option as Option;
        return (
          <Group gap="sm" p="sm">
            {option.type === "user" && <Avatar name={item.option.label} />}
            {option.type === "unknown" && <Avatar name={t`?`} />}
            {option.type === "email" && (
              <Text c="text-secondary">{t`Email: `}</Text>
            )}

            <span>{item.option.label}</span>
          </Group>
        );
      }}
      value={email ? email : stringifyValue(userId)}
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

function getData(email: string | null, users: User[]): Option[] {
  return [
    {
      label: t`Unknown`,
      value: stringifyValue(null) as string,
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

function stringifyValue(
  value: UserId | string | null | undefined,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

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
