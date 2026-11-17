import { useState } from "react";
import { t } from "ttag";

import {
  Group,
  Loader,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./PreviewBand.module.css";
import {
  useGetCollectionsPreviewQuery,
  useListPreviewPrincipalsQuery,
} from "./api";
import { AttributeTag } from "./troubleshoot/AttributeBar";

type PreviewedUserNameProps = {
  userId: number;
  name: string;
};

/** The band's name for a user preview; on hover or keyboard focus, a read-only card with who they are. */
export function PreviewedUserName({ userId, name }: PreviewedUserNameProps) {
  const [isOpened, setIsOpened] = useState(false);
  return (
    <Popover opened={isOpened} position="bottom-start">
      <Popover.Target>
        <UnstyledButton
          className={S.userName}
          onMouseEnter={() => setIsOpened(true)}
          onMouseLeave={() => setIsOpened(false)}
          onFocus={() => setIsOpened(true)}
          onBlur={() => setIsOpened(false)}
        >
          {name}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="md" w="20rem">
        {isOpened && <UserCard userId={userId} name={name} />}
      </Popover.Dropdown>
    </Popover>
  );
}

function UserCard({ userId, name }: PreviewedUserNameProps) {
  const { data: principals } = useListPreviewPrincipalsQuery();
  // the same request Explain access makes, so it's often cached
  const { data: preview } = useGetCollectionsPreviewQuery({
    principal: { type: "user", id: userId },
    namespace: "default",
  });
  if (preview == null) {
    return <Loader size="sm" />;
  }
  const email = principals?.users.find((user) => user.id === userId)?.email;
  const groupNames = preview.principal.groups.map((group) => group.name);
  const attributes = Object.entries(preview.principal.attributes ?? {});

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text fw="bold">{name}</Text>
        {email != null && (
          <Text size="sm" c="text-secondary">
            {email}
          </Text>
        )}
      </Stack>
      <Stack gap="xs">
        <Text size="sm" fw="bold">{t`Groups`}</Text>
        <Text size="sm">{groupNames.join(", ")}</Text>
      </Stack>
      <Stack gap="xs">
        <Text size="sm" fw="bold">{t`User attributes`}</Text>
        {attributes.length > 0 ? (
          <Group gap="xs">
            {attributes.map(([attribute, value]) => (
              <AttributeTag
                key={attribute}
                attribute={attribute}
                value={value}
              />
            ))}
          </Group>
        ) : (
          <Text size="sm" c="text-secondary">{t`No user attributes`}</Text>
        )}
      </Stack>
    </Stack>
  );
}
