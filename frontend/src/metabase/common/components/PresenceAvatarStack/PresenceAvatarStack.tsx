import { useState } from "react";
import { t } from "ttag";

import type {
  PresenceModel,
  PresenceParameterValue,
  PresenceParameters,
  PresenceViewer,
} from "metabase/api";
import { usePresence } from "metabase/common/hooks/use-presence";
import {
  Avatar,
  Badge,
  Box,
  Divider,
  Group,
  Icon,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

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

/** Turn a URL slug into a human-friendly label: `date_range` → `Date range`. */
function prettifyKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Map Metabase's compact date-filter slugs back to display text. Non-date
 * values pass through untouched.
 */
const DATE_SLUG_LABELS: Record<string, string> = {
  today: "Today",
  thisday: "Today",
  yesterday: "Yesterday",
  thisweek: "This week",
  thismonth: "This month",
  thisquarter: "This quarter",
  thisyear: "This year",
  past7days: "Past 7 days",
  past30days: "Past 30 days",
  past90days: "Past 90 days",
  pastquarter: "Past quarter",
};

function prettifyValue(value: PresenceParameterValue): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => prettifyValue(v as PresenceParameterValue))
      .join(", ");
  }
  if (typeof value !== "string") {
    return String(value);
  }
  return DATE_SLUG_LABELS[value.toLowerCase()] ?? value;
}

/** Compact one-line summary used in the avatar tooltip. */
function summarizeParameters(params: PresenceParameters | undefined): string {
  const entries = nonEmptyParameterEntries(params);
  if (entries.length === 0) {
    return "";
  }
  return entries
    .map(([key, value]) => `${prettifyKey(key)}: ${prettifyValue(value)}`)
    .join(" · ");
}

interface FilterBadgeProps {
  paramKey: string;
  value: PresenceParameterValue;
}

function FilterBadge({ paramKey, value }: FilterBadgeProps) {
  return (
    <Badge
      size="md"
      radius="sm"
      variant="light"
      color="brand"
      tt="none"
      fw={400}
      style={{ paddingLeft: 8, paddingRight: 8 }}
    >
      <Group gap={6} wrap="nowrap" align="center" component="span">
        <Text size="xs" c="text-secondary" fw={600} component="span">
          {prettifyKey(paramKey)}
        </Text>
        <Text size="xs" c="text-primary" fw={500} component="span">
          {prettifyValue(value)}
        </Text>
      </Group>
    </Badge>
  );
}

interface ViewerRowProps {
  viewer: PresenceViewer;
}

function ViewerRow({ viewer }: ViewerRowProps) {
  const paramEntries = nonEmptyParameterEntries(viewer.parameters);
  return (
    <Group gap="md" wrap="nowrap" align="flex-start" py="xs">
      <Avatar radius="xl" size="md" color={viewerColor(viewer)}>
        {viewerInitials(viewer)}
      </Avatar>
      <Stack gap={2} flex={1} miw={0}>
        <Text size="sm" fw={600} c="text-primary" truncate>
          {viewerDisplayName(viewer)}
        </Text>
        <Text size="xs" c="text-tertiary" truncate>
          {viewer.email}
        </Text>
        {paramEntries.length > 0 && (
          <Group gap={4} mt={6} wrap="wrap">
            {paramEntries.map(([key, value]) => (
              <FilterBadge key={key} paramKey={key} value={value} />
            ))}
          </Group>
        )}
      </Stack>
    </Group>
  );
}

/**
 * Renders a horizontal stack of avatars for the other users currently
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
      offset={8}
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
      <Popover.Dropdown p={0}>
        <Stack gap={0} miw={320} maw={420}>
          <Group gap="xs" align="center" px="md" py="sm">
            <Icon name="group" size={14} c="text-secondary" />
            <Text size="sm" fw={700} c="text-primary">
              {viewers.length === 1
                ? t`1 person viewing`
                : t`${viewers.length} people viewing`}
            </Text>
          </Group>
          <Divider />
          <ScrollArea.Autosize mah={360} type="hover" offsetScrollbars>
            <Stack gap={0} px="md" py="xs">
              {viewers.map((viewer, idx) => (
                <Box key={viewer.id}>
                  <ViewerRow viewer={viewer} />
                  {idx < viewers.length - 1 && <Divider />}
                </Box>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
