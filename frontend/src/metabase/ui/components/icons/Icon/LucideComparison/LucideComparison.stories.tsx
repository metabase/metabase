import { useEffect, useMemo, useState } from "react";

import {
  Box,
  Button,
  Card,
  Code,
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

import { type LucideIconMatch, getIconMatch } from "./lucideIconMatches";
import {
  type LocalIconPicks,
  type PickStatus,
  buildPicksFileContents,
  countUnsavedPicks,
  getIconPick,
  getLucideIconsByName,
  readLocalPicks,
  searchLucideIcons,
  setLocalPick,
  writeLocalPicks,
} from "./lucideIconPickStorage";

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
const PICKER_ICON_SIZE_PX = 20;

type MatchFilter = "all" | "matched" | "picked" | "custom" | "missing";

type LucideSettings = {
  sizePx: number;
  strokeWidth: number;
  isAbsoluteStrokeWidth: boolean;
};

/** A replacement as the sheet shows it, including picks made by hand. */
type SheetMatch = LucideIconMatch & { pickStatus?: PickStatus };

type SheetMatches = ReadonlyMap<IconName, SheetMatch | null>;

const DEFAULT_SETTINGS: LucideSettings = {
  sizePx: DEFAULT_SIZE_PX,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  isAbsoluteStrokeWidth: false,
};

/**
 * A design review sheet: every Metabase icon next to its Lucide replacement,
 * with live controls for Lucide's size and stroke width, and a picker to
 * choose a Lucide icon by hand.
 */
function LucideComparisonSheet() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [selectedName, setSelectedName] = useState<IconName>("folder");
  const [localPicks, setLocalPicks] = useState(readLocalPicks);

  useEffect(() => writeLocalPicks(localPicks), [localPicks]);

  const matches = useMemo(() => getSheetMatches(localPicks), [localPicks]);

  const visibleNames = useMemo(
    () =>
      iconNames.filter((name) => {
        const match = matches.get(name) ?? null;
        return (
          isMatchFilterSatisfied(match, matchFilter) &&
          isQuerySatisfied(name, match, query)
        );
      }),
    [matches, matchFilter, query],
  );

  const handlePick = (name: IconName, lucideName: string | null) =>
    setLocalPicks((picks) => setLocalPick(picks, name, lucideName));

  const matchedCount = iconNames.filter((name) => matches.get(name)).length;
  const customCount = iconNames.filter(
    (name) => matches.get(name)?.isCustom,
  ).length;

  return (
    <Stack gap="lg" p="lg">
      <Stack gap="xs">
        <Title order={2}>Current icons vs. Lucide</Title>
        <Text c="text-secondary">
          {matchedCount} of {iconNames.length} icons have a replacement (
          {customCount} of them custom drawings). Click an icon to inspect it,
          or to pick a different Lucide icon for it.
        </Text>
      </Stack>

      <MissingIconList
        matches={matches}
        localPicks={localPicks}
        onDiscardUnsavedPicks={() => setLocalPicks({})}
      />

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
              { value: "picked", label: "Picked by hand" },
              { value: "custom", label: "Custom" },
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
              match={matches.get(name) ?? null}
              settings={settings}
              isSelected={name === selectedName}
              onSelect={() => setSelectedName(name)}
            />
          ))}
        </Box>
        <Box w={340} pos="sticky" top={200} style={{ flexShrink: 0 }}>
          <IconInspector
            name={selectedName}
            match={matches.get(selectedName) ?? null}
            settings={settings}
            onPick={(lucideName) => handlePick(selectedName, lucideName)}
          />
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
  match,
  settings,
  isSelected,
  onSelect,
}: {
  name: IconName;
  match: SheetMatch | null;
  settings: LucideSettings;
  isSelected: boolean;
  onSelect: () => void;
}) {
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
          c={getMatchLabelColor(match)}
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
  match: SheetMatch | null;
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
  match,
  settings,
  onPick,
}: {
  name: IconName;
  match: SheetMatch | null;
  settings: LucideSettings;
  onPick: (lucideName: string | null) => void;
}) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Stack gap={0}>
          <Title order={4}>{name}</Title>
          <Text c="text-secondary" fz="sm">
            {getInspectorSubtitle(match)}
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

        {match?.isCustom ? (
          <Text c="text-secondary" fz="xs">
            This icon has a custom drawing, which takes priority over a picked
            Lucide icon.
          </Text>
        ) : (
          <LucidePicker key={name} match={match} onPick={onPick} />
        )}
      </Stack>
    </Card>
  );
}

function LucidePicker({
  match,
  onPick,
}: {
  match: SheetMatch | null;
  onPick: (lucideName: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const { names, totalCount } = useMemo(
    () => searchLucideIcons(query),
    [query],
  );
  const lucideIcons = getLucideIconsByName();

  return (
    <Stack gap="xs">
      <Text fw="bold" fz="sm">
        {match ? "Pick a different Lucide icon" : "Pick a Lucide icon"}
      </Text>
      {match?.pickStatus && (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text fz="xs" c="text-secondary">
            Picked by hand: {match.lucideName}
            {match.pickStatus === "unsaved" && " (not saved to code yet)"}
          </Text>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => onPick(null)}
          >
            Remove pick
          </Button>
        </Group>
      )}
      <TextInput
        placeholder="Search Lucide icons, e.g. circle-dot"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {query.trim() !== "" && (
        <Text fz="xs" c="text-secondary">
          {totalCount === 0
            ? "No Lucide icons match."
            : `${totalCount} match${totalCount === 1 ? "" : "es"}${
                totalCount > names.length
                  ? `, showing the first ${names.length}`
                  : ""
              }. Hover for names, click to pick.`}
        </Text>
      )}
      <Box
        display="grid"
        style={{
          gap: "var(--mantine-spacing-xs)",
          gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
        }}
      >
        {names.map((lucideName) => {
          const LucideIcon = lucideIcons.get(lucideName);
          const isCurrent = match?.lucideName === lucideName;
          return (
            LucideIcon && (
              <UnstyledButton
                key={lucideName}
                title={lucideName}
                aria-label={lucideName}
                aria-pressed={isCurrent}
                onClick={() => onPick(lucideName)}
                c="text-primary"
                p="xs"
                bd={
                  isCurrent
                    ? "2px solid var(--mb-color-core-brand)"
                    : "1px solid var(--mb-color-border-neutral)"
                }
                style={{ borderRadius: 4, lineHeight: 0 }}
              >
                <LucideIcon size={PICKER_ICON_SIZE_PX} />
              </UnstyledButton>
            )
          );
        })}
      </Box>
    </Stack>
  );
}

function MissingIconList({
  matches,
  localPicks,
  onDiscardUnsavedPicks,
}: {
  matches: SheetMatches;
  localPicks: LocalIconPicks;
  onDiscardUnsavedPicks: () => void;
}) {
  const missingNames = iconNames.filter((name) => !matches.get(name));
  const pickedCount = iconNames.filter(
    (name) => matches.get(name)?.pickStatus,
  ).length;
  const unsavedCount = countUnsavedPicks(localPicks);

  return (
    <Card withBorder>
      <Stack gap="xs">
        <Title order={4}>
          Homework: {missingNames.length} icons marked N/A
        </Title>
        <Text c="text-secondary" fz="sm">
          Lucide has no clear replacement for these. Click one to pick a Lucide
          icon for it by hand. Otherwise it needs a custom drawing in
          Lucide&apos;s style, or stays as the current SVG. To add a drawing,
          put its SVG in LucideComparison/custom-svg and run{" "}
          <code>bun run build-lucide-custom-icons</code>.
        </Text>
        <Text ff="monospace" fz="sm">
          {missingNames.join(", ")}
        </Text>
        {pickedCount > 0 && (
          <PicksExport
            pickedCount={pickedCount}
            unsavedCount={unsavedCount}
            localPicks={localPicks}
            onDiscardUnsavedPicks={onDiscardUnsavedPicks}
          />
        )}
      </Stack>
    </Card>
  );
}

function PicksExport({
  pickedCount,
  unsavedCount,
  localPicks,
  onDiscardUnsavedPicks,
}: {
  pickedCount: number;
  unsavedCount: number;
  localPicks: LocalIconPicks;
  onDiscardUnsavedPicks: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const fileContents = buildPicksFileContents(localPicks);

  const handleCopy = () =>
    navigator.clipboard.writeText(fileContents).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );

  return (
    <Stack gap="xs" mt="sm">
      <Text fz="sm">
        {pickedCount} icon{pickedCount === 1 ? "" : "s"} picked by hand.{" "}
        {unsavedCount > 0
          ? `${unsavedCount} change${unsavedCount === 1 ? " is" : "s are"} saved only in this browser. To share them, copy the picks file and paste it over LucideComparison/lucideIconPicks.ts, then commit it (or send it to an engineer).`
          : "All picks are saved in code."}
      </Text>
      {unsavedCount > 0 && (
        <Group gap="sm">
          <Button size="compact-sm" variant="filled" onClick={handleCopy}>
            {copyState === "copied" ? "Copied" : "Copy picks file"}
          </Button>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={onDiscardUnsavedPicks}
          >
            Discard unsaved changes
          </Button>
        </Group>
      )}
      {copyState === "failed" && (
        <Stack gap={4}>
          <Text fz="xs" c="text-secondary">
            Copying was blocked by the browser. Select the text below and copy
            it instead.
          </Text>
          <Code block>{fileContents}</Code>
        </Stack>
      )}
    </Stack>
  );
}

function getSheetMatches(localPicks: LocalIconPicks): SheetMatches {
  return new Map(
    iconNames.map((name) => [name, getSheetMatch(name, localPicks)]),
  );
}

/** A custom drawing wins, then a pick made by hand, then the original match. */
function getSheetMatch(
  name: IconName,
  localPicks: LocalIconPicks,
): SheetMatch | null {
  const match = getIconMatch(name);
  if (match?.isCustom) {
    return match;
  }
  const pick = getIconPick(name, localPicks);
  return pick
    ? { icon: pick.icon, lucideName: pick.lucideName, pickStatus: pick.status }
    : match;
}

function getInspectorSubtitle(match: SheetMatch | null) {
  if (!match) {
    return "No Lucide match";
  }
  return match.isCustom
    ? "Custom drawing in Lucide's style"
    : `Lucide: ${getMatchLabel(match)}`;
}

function getMatchLabel({
  lucideName,
  filled,
  isCustom,
  pickStatus,
}: SheetMatch) {
  if (isCustom) {
    return "custom drawing";
  }
  if (pickStatus === "unsaved") {
    return `${lucideName} (picked, unsaved)`;
  }
  if (pickStatus === "saved") {
    return `${lucideName} (picked)`;
  }
  return filled ? `${lucideName} (filled)` : lucideName;
}

function getMatchLabelColor(match: SheetMatch | null) {
  if (!match) {
    return "text-disabled";
  }
  return match.pickStatus ? "text-brand" : "text-secondary";
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

function isMatchFilterSatisfied(
  match: SheetMatch | null,
  matchFilter: MatchFilter,
) {
  switch (matchFilter) {
    case "all":
      return true;
    case "matched":
      return match !== null && !match.isCustom && !match.pickStatus;
    case "picked":
      return match?.pickStatus != null;
    case "custom":
      return match?.isCustom === true;
    case "missing":
      return match === null;
  }
}

function isQuerySatisfied(
  name: IconName,
  match: SheetMatch | null,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const lucideName = match?.lucideName.toLowerCase() ?? "";
  return (
    normalizedQuery === "" ||
    name.includes(normalizedQuery) ||
    lucideName.includes(normalizedQuery)
  );
}

function parseMatchFilter(value: string): MatchFilter {
  switch (value) {
    case "matched":
    case "picked":
    case "custom":
    case "missing":
      return value;
    default:
      return "all";
  }
}

export default {
  title: "Design System/Icons/Lucide comparison",
  component: LucideComparisonSheet,
  parameters: { layout: "fullscreen" },
};

export const ComparisonSheet = {
  parameters: { loki: { skip: true } },
};
