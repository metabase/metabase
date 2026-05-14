import { useState } from "react";
import { t } from "ttag";

import type { PresenceModel, PresenceViewer } from "metabase/api";
import { usePresence } from "metabase/common/hooks/use-presence";
import { Avatar, Box, Group, Popover, Stack, Text, Tooltip } from "metabase/ui";

const MAX_VISIBLE = 5;

interface PresenceAvatarStackProps {
  model: PresenceModel;
  modelId: number | undefined;
}

function viewerDisplayName(viewer: PresenceViewer): string {
  const full = [viewer.first_name, viewer.last_name]
    .filter((part) => part != null && part.length > 0)
    .join(" ");
  return full.length > 0 ? full : viewer.email;
}

function viewerInitials(viewer: PresenceViewer): string {
  const first = viewer.first_name?.[0];
  const last = viewer.last_name?.[0];
  if (first != null || last != null) {
    return `${first ?? ""}${last ?? ""}`.toUpperCase();
  }
  return viewer.email[0]?.toUpperCase() ?? "?";
}

const AVATAR_COLORS = [
  "brand",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
] as const;

type AvatarColor = (typeof AVATAR_COLORS)[number];

/** Deterministic color choice keyed by user id. */
function viewerColor(viewer: PresenceViewer): AvatarColor {
  return AVATAR_COLORS[viewer.id % AVATAR_COLORS.length];
}

/**
 * POC: Renders a horizontal stack of avatars for the other users currently
 * viewing the same question or dashboard. Returns null when alone.
 *
 * Clicking the stack (any avatar or the "+N" overflow chip) opens a popover
 * listing every viewer in full — useful when the stack is truncated past
 * MAX_VISIBLE.
 */
export function PresenceAvatarStack({
  model,
  modelId,
}: PresenceAvatarStackProps) {
  const viewers = usePresence(model, modelId);
  const [opened, setOpened] = useState(false);

  if (viewers.length === 0) {
    return null;
  }

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - visible.length;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      offset={6}
      trapFocus
    >
      <Popover.Target>
        <Box
          component="button"
          type="button"
          onClick={() => setOpened((o) => !o)}
          aria-label={t`Show all users currently viewing this page`}
          aria-expanded={opened}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
          }}
        >
          <Avatar.Group
            spacing="xs"
            aria-label={t`Users currently viewing this page`}
          >
            {visible.map((viewer) => (
              <Tooltip key={viewer.id} label={viewerDisplayName(viewer)}>
                <Avatar radius="xl" size="md" color={viewerColor(viewer)}>
                  {viewerInitials(viewer)}
                </Avatar>
              </Tooltip>
            ))}
            {overflow > 0 && (
              <Tooltip
                label={
                  overflow === 1
                    ? t`1 more person viewing`
                    : t`${overflow} more people viewing`
                }
              >
                <Avatar radius="xl" size="md" color="brand">
                  +{overflow}
                </Avatar>
              </Tooltip>
            )}
          </Avatar.Group>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm" miw={240} maw={320} p="xs">
          <Text size="sm" fw={700} c="text-secondary">
            {viewers.length === 1
              ? t`1 person viewing`
              : t`${viewers.length} people viewing`}
          </Text>
          <Stack gap="xs" mah={360} style={{ overflowY: "auto" }}>
            {viewers.map((viewer) => (
              <Group key={viewer.id} gap="sm" wrap="nowrap" align="center">
                <Avatar radius="xl" size="sm" color={viewerColor(viewer)}>
                  {viewerInitials(viewer)}
                </Avatar>
                <Stack gap={0} flex={1} miw={0}>
                  <Text size="sm" fw={600} truncate>
                    {viewerDisplayName(viewer)}
                  </Text>
                  <Text size="xs" c="text-tertiary" truncate>
                    {viewer.email}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
