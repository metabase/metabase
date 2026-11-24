import { type KeyboardEvent, useEffect, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Flex,
  Icon,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import type { PreviewTarget } from "./types";

interface PreviewBandProps {
  target: PreviewTarget;
  linkText: string;
  onOpenLink: (link: string) => void;
  onGoHome: () => void;
}

export function PreviewBand({
  target,
  linkText,
  onOpenLink,
  onGoHome,
}: PreviewBandProps) {
  const [draft, setDraft] = useState(linkText);

  useEffect(() => {
    setDraft(linkText);
  }, [linkText]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      onOpenLink(draft);
    }
  }

  return (
    <Flex
      h="3rem"
      px="md"
      gap="md"
      align="center"
      wrap="nowrap"
      bg="background_surface-warning"
    >
      <Flex gap="sm" align="center" miw={0} wrap="nowrap">
        <Icon name="eye" flex="0 0 auto" />
        <Text fw="bold" truncate>
          {getBandTitle(target)}
        </Text>
        <Badge flex="0 0 auto">{t`Read-only`}</Badge>
      </Flex>
      <Tooltip label={t`All collections`}>
        <ActionIcon
          flex="0 0 auto"
          aria-label={t`All collections`}
          onClick={onGoHome}
        >
          <Icon name="home" />
        </ActionIcon>
      </Tooltip>
      <TextInput
        flex={1}
        miw={0}
        aria-label={t`Link or ID`}
        leftSection={<Icon name="link" />}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
    </Flex>
  );
}

function getBandTitle(target: PreviewTarget) {
  return target.kind === "user"
    ? t`Previewing as ${target.user.common_name}`
    : t`Previewing as a member of ${target.group.name}`;
}
