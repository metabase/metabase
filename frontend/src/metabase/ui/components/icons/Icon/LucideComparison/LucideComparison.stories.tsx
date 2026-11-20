import { useMemo, useState } from "react";

import {
  Box,
  Button,
  Card,
  Flex,
  Group,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { Icon } from "../Icon";
import { iconNames } from "../icons";

import { LUCIDE_ICON_MATCHES, type LucideIconMatch } from "./lucideIconMatches";

const LUCIDE_GRID_SIZE_PX = 24;
const DEFAULT_SIZE_PX = 16;
const MIN_SIZE_PX = 10;
const MAX_SIZE_PX = 48;
const DEFAULT_STROKE_WIDTH = 2;
const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 3.5;
const STROKE_WIDTH_STEP = 0.05;
const INSPECTOR_SIZES_PX = [12, 16, 20, 24, 32] as const;
const OVERLAY_SIZE_PX = 120;
const CARD_MIN_WIDTH_PX = 150;

type MatchFilter = "all" | "matched" | "missing";

type LucideSettings = {
  sizePx: number;
  strokeWidth: number;
  isAbsoluteStrokeWidth: boolean;
};

const DEFAULT_SETTINGS: LucideSettings = {
  sizePx: DEFAULT_SIZE_PX,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  isAbsoluteStrokeWidth: false,
};

const MISSING_ICON_NAMES = iconNames.filter(
  (name) => LUCIDE_ICON_MATCHES[name] === null,
);

/**
 * A design review sheet: every Metabase icon next to its Lucide replacement,
 * with live controls for Lucide's size and stroke width.
 */
function LucideComparisonSheet() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [selectedName, setSelectedName] = useState<IconName>("folder");

  const visibleNames = useMemo(
    () =>
      iconNames.filter(
        (name) =>
          isMatchFilterSatisfied(name, matchFilter) &&
          isQuerySatisfied(name, query),
      ),
    [matchFilter, query],
  );

  return (
    <Stack gap="lg" p="lg">
      <Stack gap="xs">
        <Title order={2}>Current icons vs. Lucide</Title>
        <Text c="text-secondary">
          {iconNames.length - MISSING_ICON_NAMES.length} of {iconNames.length}{" "}
          icons have a Lucide replacement. Click an icon to inspect it.
        </Text>
      </Stack>

      <MissingIconList />

      <Card withBorder pos="sticky" top={0} style={{ zIndex: 1 }}>
        <LucideControls settings={settings} onChange={setSettings} />
        <Group mt="md" gap="md">
          <TextInput
            placeholder="Search by our name or the Lucide name"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            w={320}
          />
          <SegmentedControl
            value={matchFilter}
            onChange={(value) => setMatchFilter(parseMatchFilter(value))}
            data={[
              { value: "all", label: "All" },
              { value: "matched", label: "Has Lucide match" },
              { value: "missing", label: "N/A" },
            ]}
          />
          <Text c="text-secondary">{visibleNames.length} shown</Text>
        </Group>
      </Card>

      <Flex gap="lg" align="flex-start">
        <Box
          display="grid"
          flex={1}
          style={{
            gap: "var(--mantine-spacing-sm)",
            gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH_PX}px, 1fr))`,
          }}
        >
          {visibleNames.map((name) => (
            <IconPairCard
              key={name}
              name={name}
              settings={settings}
              isSelected={name === selectedName}
              onSelect={() => setSelectedName(name)}
            />
          ))}
        </Box>
        <Box w={340} pos="sticky" top={200} style={{ flexShrink: 0 }}>
          <IconInspector name={selectedName} settings={settings} />
        </Box>
      </Flex>
    </Stack>
  );
}

function LucideControls({
  settings,
  onChange,
}: {
  settings: LucideSettings;
  onChange: (settings: LucideSettings) => void;
}) {
  const { sizePx, strokeWidth, isAbsoluteStrokeWidth } = settings;

  return (
    <Group align="flex-end" gap="xl">
      <Stack gap={4} w={280}>
        <Text fw="bold">Lucide stroke width: {strokeWidth.toFixed(2)}</Text>
        <Slider
          min={MIN_STROKE_WIDTH}
          max={MAX_STROKE_WIDTH}
          step={STROKE_WIDTH_STEP}
          value={strokeWidth}
          onChange={(value) => onChange({ ...settings, strokeWidth: value })}
          label={(value) => value.toFixed(2)}
        />
      </Stack>
      <Stack gap={4} w={220}>
        <Text fw="bold">Size: {sizePx} px</Text>
        <Slider
          min={MIN_SIZE_PX}
          max={MAX_SIZE_PX}
          step={1}
          value={sizePx}
          onChange={(value) => onChange({ ...settings, sizePx: value })}
        />
      </Stack>
      <Switch
        label="Absolute stroke width (px at any size)"
        checked={isAbsoluteStrokeWidth}
        onChange={(event) =>
          onChange({
            ...settings,
            isAbsoluteStrokeWidth: event.currentTarget.checked,
          })
        }
      />
      <Stack gap={0}>
        <Text>
          Lucide line on screen:{" "}
          <strong>{getRenderedStrokePx(settings, sizePx).toFixed(2)} px</strong>{" "}
          at {sizePx} px
        </Text>
        <Text c="text-secondary" fz="sm">
          Most current icons draw lines about 1.5 px wide at 16 px.
        </Text>
      </Stack>
      <Button variant="subtle" onClick={() => onChange(DEFAULT_SETTINGS)}>
        Reset
      </Button>
    </Group>
  );
}

function IconPairCard({
  name,
  settings,
  isSelected,
  onSelect,
}: {
  name: IconName;
  settings: LucideSettings;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const match = LUCIDE_ICON_MATCHES[name];

  return (
    <UnstyledButton onClick={onSelect} aria-pressed={isSelected}>
      <Card
        withBorder
        p="sm"
        h="100%"
        style={
          isSelected
            ? {
                outline: "2px solid var(--mb-color-core-brand)",
                outlineOffset: -1,
              }
            : undefined
        }
      >
        <Text fw="bold" fz="sm" truncate title={name}>
          {name}
        </Text>
        <Group gap="md" my="sm" justify="center" mih={MAX_SIZE_PX}>
          <Icon name={name} size={settings.sizePx} c="text-primary" />
          <Text c="text-secondary" fz="sm">
            →
          </Text>
          <LucideGlyph match={match} settings={settings} />
        </Group>
        <Text
          c={match ? "text-secondary" : "text-disabled"}
          fz="xs"
          truncate
          title={match?.lucideName}
        >
          {match ? getMatchLabel(match) : "No Lucide match"}
        </Text>
      </Card>
    </UnstyledButton>
  );
}

function LucideGlyph({
  match,
  settings,
  sizePx = settings.sizePx,
}: {
  match: LucideIconMatch | null;
  settings: LucideSettings;
  sizePx?: number;
}) {
  if (!match) {
    return (
      <Text c="text-disabled" fz="sm" fw="bold">
        N/A
      </Text>
    );
  }

  const LucideIcon = match.icon;
  return (
    <Box c="text-primary" lh={0}>
      <LucideIcon
        size={sizePx}
        strokeWidth={settings.strokeWidth}
        absoluteStrokeWidth={settings.isAbsoluteStrokeWidth}
        fill={match.filled ? "currentColor" : "none"}
        aria-label={`${match.lucideName} Lucide icon`}
      />
    </Box>
  );
}

function IconInspector({
  name,
  settings,
}: {
  name: IconName;
  settings: LucideSettings;
}) {
  const match = LUCIDE_ICON_MATCHES[name];

  return (
    <Card withBorder>
      <Stack gap="md">
        <Stack gap={0}>
          <Title order={4}>{name}</Title>
          <Text c="text-secondary" fz="sm">
            {match ? `Lucide: ${getMatchLabel(match)}` : "No Lucide match"}
          </Text>
        </Stack>

        <Stack gap="xs">
          {INSPECTOR_SIZES_PX.map((sizePx) => (
            <Group key={sizePx} gap="md" wrap="nowrap">
              <Text c="text-secondary" fz="sm" w={40}>
                {sizePx} px
              </Text>
              <Box w={40} c="text-primary">
                <Icon name={name} size={sizePx} />
              </Box>
              <LucideGlyph match={match} settings={settings} sizePx={sizePx} />
              {match && (
                <Text c="text-secondary" fz="xs">
                  line {getRenderedStrokePx(settings, sizePx).toFixed(2)} px
                </Text>
              )}
            </Group>
          ))}
        </Stack>

        {match && (
          <Stack gap="xs">
            <Text fw="bold" fz="sm">
              Overlay
            </Text>
            <Box pos="relative" w={OVERLAY_SIZE_PX} h={OVERLAY_SIZE_PX}>
              <Box pos="absolute" inset={0} c="text-disabled" lh={0}>
                <Icon name={name} size={OVERLAY_SIZE_PX} />
              </Box>
              <Box pos="absolute" inset={0} c="text-brand" lh={0}>
                <match.icon
                  size={OVERLAY_SIZE_PX}
                  strokeWidth={getOverlayStrokeWidth(settings)}
                  absoluteStrokeWidth={settings.isAbsoluteStrokeWidth}
                  fill={match.filled ? "currentColor" : "none"}
                  fillOpacity={match.filled ? 0.3 : undefined}
                />
              </Box>
            </Box>
            <Text c="text-secondary" fz="xs">
              Grey: current icon. Blue: Lucide, scaled up with the same
              stroke-to-size ratio as at {settings.sizePx} px.
            </Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function MissingIconList() {
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Title order={4}>
          Homework: {MISSING_ICON_NAMES.length} icons marked N/A
        </Title>
        <Text c="text-secondary" fz="sm">
          Lucide has no clear replacement for these. Each needs a custom drawing
          in Lucide&apos;s style, or stays as the current SVG.
        </Text>
        <Text ff="monospace" fz="sm">
          {MISSING_ICON_NAMES.join(", ")}
        </Text>
      </Stack>
    </Card>
  );
}

function getMatchLabel({ lucideName, filled }: LucideIconMatch) {
  return filled ? `${lucideName} (filled)` : lucideName;
}

/** Width of a Lucide line in screen pixels when drawn at `sizePx`. */
function getRenderedStrokePx(
  { strokeWidth, isAbsoluteStrokeWidth }: LucideSettings,
  sizePx: number,
) {
  return isAbsoluteStrokeWidth
    ? strokeWidth
    : (strokeWidth * sizePx) / LUCIDE_GRID_SIZE_PX;
}

/**
 * The overlay is drawn large, so an absolute stroke width is scaled up to keep
 * the same weight relative to the icon that it has at the chosen size.
 */
function getOverlayStrokeWidth(settings: LucideSettings) {
  return settings.isAbsoluteStrokeWidth
    ? (settings.strokeWidth * OVERLAY_SIZE_PX) / settings.sizePx
    : settings.strokeWidth;
}

function isMatchFilterSatisfied(name: IconName, matchFilter: MatchFilter) {
  const hasMatch = LUCIDE_ICON_MATCHES[name] !== null;
  switch (matchFilter) {
    case "all":
      return true;
    case "matched":
      return hasMatch;
    case "missing":
      return !hasMatch;
  }
}

function isQuerySatisfied(name: IconName, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const lucideName = LUCIDE_ICON_MATCHES[name]?.lucideName ?? "";
  return (
    normalizedQuery === "" ||
    name.includes(normalizedQuery) ||
    lucideName.includes(normalizedQuery)
  );
}

function parseMatchFilter(value: string): MatchFilter {
  return value === "matched" || value === "missing" ? value : "all";
}

export default {
  title: "Design System/Icons/Lucide comparison",
  component: LucideComparisonSheet,
  parameters: { layout: "fullscreen" },
};

export const ComparisonSheet = {
  parameters: { loki: { skip: true } },
};
