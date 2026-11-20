import { t } from "ttag";

import { skipToken } from "metabase/api";
import { Group, Icon, Stack, Text, Tooltip, UnstyledButton } from "metabase/ui";

import {
  type Principal,
  useGetCollectionsPreviewQuery,
  useListPreviewPrincipalsQuery,
} from "./api";

type GroupPreviewInfoProps = {
  /** The groups the stand-in is in, such as All internal users and Sales; empty while they load. */
  groupNames: string[];
  /** Troubleshoot and full screen run the stand-in with the values picked; the grids combine each member's own. */
  attributeValues: "picked" | "each-member";
  /** "How it works" instead, so a band below 1280px keeps room for its sentence and controls. */
  isCompact?: boolean;
};

/**
 * "ⓘ How group preview works": on hover or keyboard focus, a tooltip saying the preview runs as a stand-in user, not
 * a real one, in which groups, and with which attribute values.
 */
export function GroupPreviewInfo({
  groupNames,
  attributeValues,
  isCompact = false,
}: GroupPreviewInfoProps) {
  return (
    <Tooltip
      // above the band, so it stays clear of the attribute chips under it; at the top of the screen it flips below
      position="top"
      multiline
      w="20rem"
      label={
        <Stack gap="xs" py="xs">
          <Text fw="bold" c="inherit">{t`A stand-in, not a real user`}</Text>
          <Text c="inherit">
            {[getGroupsSentence(groupNames), getValuesSentence(attributeValues)]
              .filter((sentence) => sentence != null)
              .join(" ")}
          </Text>
          <Text c="inherit">{t`Real members may see more through their other groups.`}</Text>
        </Stack>
      }
    >
      <UnstyledButton
        // starts with the shown words, so voice control finds it by them
        aria-label={isCompact ? t`How it works: group preview` : undefined}
        c="text-primary"
        mih="1.5rem"
        style={{ flexShrink: 0 }}
      >
        <Group gap="xs" wrap="nowrap">
          <Icon name="info" />
          <Text size="sm" c="inherit" style={{ whiteSpace: "nowrap" }}>
            {isCompact ? t`How it works` : t`How group preview works`}
          </Text>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}

function getGroupsSentence(groupNames: string[]) {
  if (groupNames.length === 0) {
    return null;
  }
  const lastName = groupNames[groupNames.length - 1];
  const names =
    groupNames.length === 1
      ? lastName
      : t`${groupNames.slice(0, -1).join(", ")} and ${lastName}`;
  return t`In ${names} only.`;
}

function getValuesSentence(attributeValues: "picked" | "each-member") {
  return attributeValues === "picked"
    ? t`Where a rule reads an attribute, it uses the value you pick.`
    : t`Where a rule reads an attribute, it uses each member's own value.`;
}

/** Under a who-picker's search while Group is chosen. */
export function getStandInHint() {
  return t`Previews a stand-in member, not a real user.`;
}

export function StandInHint() {
  return (
    <Text size="sm" c="text-secondary">
      {getStandInHint()}
    </Text>
  );
}

/** The names of the groups a group's stand-in is in; empty for a user, or while they load. */
export function useStandInGroupNames(principal: Principal | null): string[] {
  const { data } = useGetCollectionsPreviewQuery(
    principal != null && principal.type !== "user"
      ? {
          principal: { type: principal.type, id: principal.id },
          namespace: "default",
        }
      : skipToken,
  );
  return data?.principal.groups.map((group) => group.name) ?? [];
}

/** How many members a group has, for "Gadget · 2 of 7 members"; undefined for a user, or while loading. */
export function useGroupMemberCount(principal: Principal | null) {
  const { data } = useListPreviewPrincipalsQuery(
    principal?.type === "group" ? undefined : skipToken,
  );
  return data?.groups.find((group) => group.id === principal?.id)?.member_count;
}
