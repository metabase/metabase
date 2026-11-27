import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useGetUserQuery, useListPermissionsGroupsQuery } from "metabase/api";
import {
  Box,
  Flex,
  Loader,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { User } from "metabase-types/api";

import { AttributeTag } from "./AttributeChip";
import S from "./PreviewedUserName.module.css";

const CLOSE_DELAY_MS = 100;

interface PreviewedUserNameProps {
  user: User;
}

/** The previewed person's name; hover or focus shows who they are. */
export function PreviewedUserName({ user }: PreviewedUserNameProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function open() {
    clearTimeout(closeTimer.current);
    setIsOpen(true);
  }

  function close() {
    closeTimer.current = setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  }

  return (
    <Popover opened={isOpen} position="bottom-start" onChange={setIsOpen}>
      <Popover.Target>
        <UnstyledButton
          className={S.name}
          fw="bold"
          onMouseEnter={open}
          onMouseLeave={close}
          onFocus={open}
          onBlur={close}
        >
          {user.common_name}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        p="md"
        w="20rem"
        onMouseEnter={open}
        onMouseLeave={close}
      >
        <UserCard user={user} />
      </Popover.Dropdown>
    </Popover>
  );
}

function UserCard({ user }: { user: User }) {
  const { data: details, isLoading } = useGetUserQuery(user.id);
  const { data: groups = [] } = useListPermissionsGroupsQuery({});

  const groupNames = (details?.user_group_memberships ?? [])
    .map((membership) => groups.find((group) => group.id === membership.id))
    .filter((group) => group != null)
    .map((group) => group.name);
  // the person's attributes as Metabase applies them, tenant ones included
  const attributes = Object.entries(details?.structured_attributes ?? {})
    .filter(([name]) => !name.startsWith("@"))
    .map(([name, attribute]) => [name, attribute.value] as const);

  return (
    <Stack gap="xs">
      <Box>
        <Text fw="bold">{user.common_name}</Text>
        <Text fz="sm" c="text-secondary">
          {user.email}
        </Text>
      </Box>
      {isLoading ? (
        <Loader size="sm" />
      ) : (
        <>
          <Box>
            <Text fz="sm" fw="bold">{t`Groups`}</Text>
            <Text fz="sm">{groupNames.join(", ")}</Text>
          </Box>
          <Box>
            <Text fz="sm" fw="bold">{t`User attributes`}</Text>
            {attributes.length === 0 ? (
              <Text fz="sm" c="text-secondary">{t`No user attributes`}</Text>
            ) : (
              <Flex gap="sm" mt="sm" wrap="wrap">
                {attributes.map(([name, value]) => (
                  <AttributeTag key={name} name={name} value={value} />
                ))}
              </Flex>
            )}
          </Box>
        </>
      )}
    </Stack>
  );
}
