import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useGetInspectorV2LensQuery } from "metabase-enterprise/api";
import type {
  InspectorV2Card,
  InspectorV2DiscoveryResponse,
  InspectorV2Lens,
  InspectorV2Section,
  TransformId,
} from "metabase-types/api";

import { ColumnComparisonSection } from "./ColumnComparisonSection";
import { ComparisonSection } from "./ComparisonSection";
import { FieldInfoSection } from "./FieldInfoSection";
import { FlatSection } from "./FlatSection";
import { JoinAnalysisSection } from "./JoinAnalysisSection";
import { LensSummary } from "./LensSummary";

// Map lens IDs to friendly display names
const DRILL_LENS_NAMES: Record<string, string> = {
  "unmatched-rows": "Unmatched Rows",
};

function formatDrillLensName(lensId: string): string {
  return (
    DRILL_LENS_NAMES[lensId] ??
    lensId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Context for collecting card results to evaluate triggers
type CardResultsContextType = {
  cardResults: Record<string, Record<string, unknown>>;
  setCardResult: (cardId: string, result: Record<string, unknown>) => void;
};

const CardResultsContext = createContext<CardResultsContextType>({
  cardResults: {},
  setCardResult: () => {},
});

export const useCardResultsContext = () => useContext(CardResultsContext);

// Drill lens info for tracking open drill lenses
type DrillLensInfo = {
  key: string;
  lensId: string;
  params?: Record<string, unknown>;
  displayName: string;
};

type LensContentProps = {
  transformId: TransformId;
  lensId: string;
  discovery: InspectorV2DiscoveryResponse;
  params?: Record<string, unknown>;
  onClose?: () => void;
};

export const LensContent = ({
  transformId,
  lensId,
  discovery,
  params,
  onClose,
}: LensContentProps) => {
  const { data: lens, isLoading, error } = useGetInspectorV2LensQuery({
    transformId,
    lensId,
    params,
  });
  // Track multiple open drill lenses
  const [openDrillLenses, setOpenDrillLenses] = useState<DrillLensInfo[]>([]);
  const [cardResults, setCardResults] = useState<
    Record<string, Record<string, unknown>>
  >({});

  const setCardResult = useCallback(
    (cardId: string, result: Record<string, unknown>) => {
      setCardResults((prev) => ({ ...prev, [cardId]: result }));
    },
    [],
  );

  // Evaluate drill lens triggers
  const activatedDrillLenses = useMemo(() => {
    if (!lens?.drill_lens_triggers) return [];

    return lens.drill_lens_triggers.filter((trigger) => {
      const result = cardResults[trigger.condition.card_id];
      if (!result) return false;

      const field = trigger.condition.field;
      const value = field ? result[String(field)] : result;
      const threshold = trigger.condition.threshold;

      if (value == null || threshold == null) return false;

      switch (trigger.condition.comparator) {
        case ">":
          return (value as number) > (threshold as number);
        case ">=":
          return (value as number) >= (threshold as number);
        case "<":
          return (value as number) < (threshold as number);
        case "<=":
          return (value as number) <= (threshold as number);
        case "=":
          return value === threshold;
        case "!=":
          return value !== threshold;
        default:
          return false;
      }
    });
  }, [lens?.drill_lens_triggers, cardResults]);

  if (isLoading || error) {
    return (
      <Center h={200}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (!lens) {
    return null;
  }

  // Build drill lens buttons from static drill_lenses and triggered ones
  const drillLensButtons: DrillLensInfo[] = [];

  // Static drill lenses (always shown if defined)
  for (const dl of lens.drill_lenses ?? []) {
    drillLensButtons.push({
      key: dl.id,
      lensId: dl.id,
      displayName: dl.display_name,
    });
  }

  // Triggered drill lenses (with params for filtering)
  for (const trigger of activatedDrillLenses) {
    // Use reason as suffix if provided
    const baseName = formatDrillLensName(trigger.lens_id);
    const suffix = trigger.reason ? `: ${trigger.reason}` : "";
    const displayName = baseName + suffix;

    // Create unique key from lens_id and params
    const paramsKey = trigger.params ? JSON.stringify(trigger.params) : "none";

    drillLensButtons.push({
      key: `${trigger.lens_id}-${paramsKey}`,
      lensId: trigger.lens_id,
      displayName,
      params: trigger.params,
    });
  }

  // Filter out already-open drill lenses from buttons
  const availableDrillButtons = drillLensButtons.filter(
    (btn) => !openDrillLenses.some((open) => open.key === btn.key),
  );

  const handleDrillLensOpen = (drillLens: DrillLensInfo) => {
    setOpenDrillLenses((prev) => [...prev, drillLens]);
  };

  const handleDrillLensClose = (key: string) => {
    setOpenDrillLenses((prev) => prev.filter((dl) => dl.key !== key));
  };

  return (
    <CardResultsContext.Provider value={{ cardResults, setCardResult }}>
      <Box
        style={{
          border: onClose ? "1px solid var(--mb-color-border)" : undefined,
          borderRadius: onClose ? "8px" : undefined,
          padding: onClose ? "16px" : undefined,
        }}
      >
        <Stack gap="xl">
          {/* Lens header with optional close button */}
          <Group justify="space-between" align="flex-start">
            <Title order={onClose ? 3 : 2}>{lens.display_name}</Title>
            {onClose && (
              <ActionIcon
                variant="subtle"
                onClick={onClose}
                aria-label={t`Close`}
              >
                <Text size="lg">&times;</Text>
              </ActionIcon>
            )}
          </Group>

          {lens.summary && <LensSummary summary={lens.summary} />}

          <SectionsRenderer lens={lens} lensId={lensId} discovery={discovery} />

          {/* Drill lens buttons */}
          {availableDrillButtons.length > 0 && (
            <DrillLensButtons
              buttons={availableDrillButtons}
              onSelect={handleDrillLensOpen}
            />
          )}

          {/* Open drill lenses rendered below */}
          {openDrillLenses.length > 0 && (
            <Stack gap="lg">
              <Divider />
              {openDrillLenses.map((drillLens) => (
                <DrillLensPanel
                  key={drillLens.key}
                  transformId={transformId}
                  drillLens={drillLens}
                  discovery={discovery}
                  onClose={() => handleDrillLensClose(drillLens.key)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Box>
    </CardResultsContext.Provider>
  );
};

type DrillLensPanelProps = {
  transformId: TransformId;
  drillLens: DrillLensInfo;
  discovery: InspectorV2DiscoveryResponse;
  onClose: () => void;
};

const DrillLensPanel = ({
  transformId,
  drillLens,
  discovery,
  onClose,
}: DrillLensPanelProps) => {
  return (
    <LensContent
      transformId={transformId}
      lensId={drillLens.lensId}
      discovery={discovery}
      params={drillLens.params}
      onClose={onClose}
    />
  );
};

type DrillLensButtonsProps = {
  buttons: DrillLensInfo[];
  onSelect: (button: DrillLensInfo) => void;
};

const DrillLensButtons = ({ buttons, onSelect }: DrillLensButtonsProps) => (
  <Flex gap="sm" wrap="wrap">
    {buttons.map((button) => (
      <Button
        key={button.key}
        variant="outline"
        size="sm"
        onClick={() => onSelect(button)}
      >
        {button.displayName}
      </Button>
    ))}
  </Flex>
);

type SectionsRendererProps = {
  lens: InspectorV2Lens;
  lensId: string;
  discovery: InspectorV2DiscoveryResponse;
};

const SectionsRenderer = ({
  lens,
  lensId,
  discovery,
}: SectionsRendererProps) => {
  const cardsBySection = useMemo(() => {
    const map = new Map<string, InspectorV2Card[]>();
    for (const card of lens.cards) {
      const sectionId = card.section_id ?? "default";
      const existing = map.get(sectionId) ?? [];
      map.set(sectionId, [...existing, card]);
    }
    return map;
  }, [lens.cards]);

  return (
    <Stack gap="xl">
      {lens.sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          cards={cardsBySection.get(section.id) ?? []}
          lensId={lensId}
          discovery={discovery}
        />
      ))}
    </Stack>
  );
};

type SectionRendererProps = {
  section: InspectorV2Section;
  cards: InspectorV2Card[];
  lensId: string;
  discovery: InspectorV2DiscoveryResponse;
};

const SectionRenderer = ({
  section,
  cards,
  lensId,
  discovery,
}: SectionRendererProps) => {
  if (cards.length === 0) {
    return null;
  }

  // Use lens-specific rendering for join-analysis
  if (lensId === "join-analysis") {
    return (
      <Stack gap="md">
        <Title order={3}>{section.title}</Title>
        {section.description && (
          <Text c="text-secondary">{section.description}</Text>
        )}
        <JoinAnalysisSection cards={cards} />
      </Stack>
    );
  }

  // Use lens-specific rendering for column-comparison
  if (lensId === "column-comparison") {
    return (
      <Stack gap="md">
        <Title order={3}>{section.title}</Title>
        {section.description && (
          <Text c="text-secondary">{section.description}</Text>
        )}
        <ColumnComparisonSection
          cards={cards}
          sources={discovery.sources}
          target={discovery.target}
          visitedFields={discovery.visited_fields}
        />
      </Stack>
    );
  }

  // Use lens-specific rendering for generic-summary (row counts as tables)
  if (lensId === "generic-summary") {
    return (
      <Stack gap="md">
        <Title order={3}>{section.title}</Title>
        {section.description && (
          <Text c="text-secondary">{section.description}</Text>
        )}
        <ComparisonSection
          cards={cards}
          sources={discovery.sources}
          target={discovery.target}
          asTable
        />
        <FieldInfoSection
          sources={discovery.sources}
          target={discovery.target}
        />
      </Stack>
    );
  }

  // Use layout-based rendering for other lenses
  const layout = section.layout ?? "flat";

  return (
    <Stack gap="md">
      <Title order={3}>{section.title}</Title>
      {section.description && (
        <Text c="text-secondary">{section.description}</Text>
      )}
      {layout === "comparison" ? (
        <ComparisonSection cards={cards} />
      ) : (
        <FlatSection cards={cards} />
      )}
    </Stack>
  );
};
