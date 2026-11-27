import { useMediaQuery } from "@mantine/hooks";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { Icon, Stack, Text, Tooltip, UnstyledButton } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import { formatList } from "../utils/format-list";

interface GroupPreviewInfoProps {
  group: GroupInfo;
}

/** What a group preview is, on hover or focus: it runs as a stand-in member. */
export function GroupPreviewInfo({ group }: GroupPreviewInfoProps) {
  const { data: groups = [] } = useListPermissionsGroupsQuery({});
  const isNarrow = !useMediaQuery("(min-width: 80rem)");

  // the stand-in is in the group and in the magic group of its kind, nothing else
  const magicGroupType = group.is_tenant_group
    ? "all-external-users"
    : "all-internal-users";
  const magicGroup = groups.find(
    (other) => other.magic_group_type === magicGroupType,
  );
  const groupNames = formatList([
    ...new Set([group.name, magicGroup?.name ?? group.name]),
  ]);

  return (
    <Tooltip
      multiline
      position="top"
      w="20rem"
      label={
        <Stack gap="xs" py="xs">
          <Text fw="bold" c="inherit">{t`A stand-in, not a real user`}</Text>
          <Text c="inherit">
            {t`In ${groupNames} only.`}{" "}
            {t`Where a rule reads an attribute, it uses the value you pick.`}
          </Text>
          <Text c="inherit">{t`Real members may see more through their other groups.`}</Text>
        </Stack>
      }
    >
      <UnstyledButton
        mih="1.5rem"
        c="text-primary"
        display="flex"
        style={{ alignItems: "center", gap: "var(--mantine-spacing-xs)" }}
        aria-label={isNarrow ? t`How it works: group preview` : undefined}
      >
        <Icon name="info" />
        <Text
          component="span"
          fz="sm"
          c="inherit"
          style={{ whiteSpace: "nowrap" }}
        >
          {isNarrow ? t`How it works` : t`How group preview works`}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}
