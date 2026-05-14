import { useState } from "react";
import { t } from "ttag";

import type {
  PresenceModel,
  PresenceParameterValue,
  PresenceParameters,
  PresenceViewer,
} from "metabase/api";
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
 * Filter out parameter entries whose value is missing or an empty string —
 * Metabase's dashboard URL state tends to include every declared filter
 * (even ones the user hasn't picked a value for) with empty strings, which
 * would otherwise show up as confusing "key:" rows in the popover.
 */
function nonEmptyParameterEntries(
  params: PresenceParameters | undefined,
): Array<[string, PresenceParameterValue]> {
  if (params == null) {
    return [];
  }
  return Object.entries(params).filter(([, value]) => {
    if (value == null) {
      return false;
    }
    if (typeof value === "string") {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  });
}

/** Short, single-line summary of the viewer's URL parameters for the tooltip. */
function summarizeParameters(params: PresenceParameters | undefined): string {
  const entries = nonEmptyParameterEntries(params);
  if (entries.length === 0) {
    return "";
  }
  return entries
    .map(([key, value]) => {
      const v = Array.isArray(value) ? value.join(", ") : String(value ?? "—");
      return `${key}: ${v}`;
    })
    .join(" · ");
}

interface ViewerRowProps {
  viewer: PresenceViewer;
}

function ViewerRow({ viewer }: ViewerRowProps) {
  const paramEntries = nonEmptyParameterEntries(viewer.parameters);
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Avatar radius="xl" size="sm" color={viewerColor(viewer)}>
        {viewerInitials(viewer)}
      </Avatar>
      <Stack gap={2} flex={1} miw={0}>
        <Text size="sm" fw={600} truncate>
          {viewerDisplayName(viewer)}
        </Text>
        <Text size="xs" c="text-tertiary" truncate>
          {viewer.email}
        </Text>
        {paramEntries.length > 0 && (
          <Stack gap={0} mt={4}>
            <Text size="xs" c="text-tertiary" fw={600}>
              {t`Filters`}
            </Text>
            {paramEntries.map(([key, value]) => (
              <Text key={key} size="xs" c="text-secondary">
                <Text component="span" c="text-tertiary">
                  {key}:
                </Text>{" "}
                {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Group>
  );
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
            {visible.map((viewer) => {
              const summary = summarizeParameters(viewer.parameters);
              const name = viewerDisplayName(viewer);
              return (
                <Tooltip
                  key={viewer.id}
                  label={summary ? `${name} — ${summary}` : name}
                  multiline
                  maw={320}
                >
                  <Avatar radius="xl" size="md" color={viewerColor(viewer)}>
                    {viewerInitials(viewer)}
                  </Avatar>
                </Tooltip>
              );
            })}
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
          <Stack gap="md" mah={420} style={{ overflowY: "auto" }}>
            {viewers.map((viewer) => (
              <ViewerRow key={viewer.id} viewer={viewer} />
            ))}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
