import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Button, Center, Flex, Stack, Text, Title } from "metabase/ui";
import { useGetInspectorV2LensQuery } from "metabase-enterprise/api";
import type {
  InspectorV2Card,
  InspectorV2DiscoveryResponse,
  InspectorV2DrillLensTrigger,
  InspectorV2Lens,
  InspectorV2Section,
  TransformId,
} from "metabase-types/api";

import { ColumnComparisonSection } from "./ColumnComparisonSection";
import { ComparisonSection } from "./ComparisonSection";
import { FlatSection } from "./FlatSection";
import { JoinAnalysisSection } from "./JoinAnalysisSection";
import { LensSummary } from "./LensSummary";

// Map lens IDs to friendly display names
const DRILL_LENS_NAMES: Record<string, string> = {
  "unmatched-rows": "View Unmatched Rows",
};

function formatDrillLensName(lensId: string): string {
  return DRILL_LENS_NAMES[lensId] ?? lensId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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

type LensContentProps = {
  transformId: TransformId;
  lensId: string;
  discovery: InspectorV2DiscoveryResponse;
};

export const LensContent = ({ transformId, lensId, discovery }: LensContentProps) => {
  const { data: lens, isLoading, error } = useGetInspectorV2LensQuery({
    transformId,
    lensId,
  });
  const [activeDrillLens, setActiveDrillLens] = useState<string | null>(null);
  const [cardResults, setCardResults] = useState<Record<string, Record<string, unknown>>>({});

  const setCardResult = useCallback((cardId: string, result: Record<string, unknown>) => {
    setCardResults(prev => ({ ...prev, [cardId]: result }));
  }, []);

  // Evaluate drill lens triggers
  const activatedDrillLenses = useMemo(() => {
    if (!lens?.drill_lens_triggers) return [];

    return lens.drill_lens_triggers.filter(trigger => {
      const result = cardResults[trigger.condition.card_id];
      if (!result) return false;

      const field = trigger.condition.field;
      const value = field ? result[String(field)] : result;
      const threshold = trigger.condition.threshold;

      if (value == null || threshold == null) return false;

      switch (trigger.condition.comparator) {
        case ">": return (value as number) > (threshold as number);
        case ">=": return (value as number) >= (threshold as number);
        case "<": return (value as number) < (threshold as number);
        case "<=": return (value as number) <= (threshold as number);
        case "=": return value === threshold;
        case "!=": return value !== threshold;
        default: return false;
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

  // If a drill lens is active, show it instead
  if (activeDrillLens) {
    return (
      <Stack gap="md">
        <Button variant="subtle" onClick={() => setActiveDrillLens(null)}>
          ← Back to {lens.display_name}
        </Button>
        <LensContent
          transformId={transformId}
          lensId={activeDrillLens}
          discovery={discovery}
        />
      </Stack>
    );
  }

  // Combine static drill lenses with triggered ones
  const allDrillLenses = [
    ...(lens.drill_lenses ?? []),
    ...activatedDrillLenses.map(t => ({
      id: t.lens_id,
      display_name: formatDrillLensName(t.lens_id),
      description: t.reason,
    })),
  ];

  // Dedupe by id
  const uniqueDrillLenses = allDrillLenses.filter(
    (dl, idx, arr) => arr.findIndex(d => d.id === dl.id) === idx
  );

  return (
    <CardResultsContext.Provider value={{ cardResults, setCardResult }}>
      <Stack gap="xl">
        <Title order={2}>{lens.display_name}</Title>
        {lens.summary && <LensSummary summary={lens.summary} />}
        <SectionsRenderer
          lens={lens}
          lensId={lensId}
          discovery={discovery}
        />
        {uniqueDrillLenses.length > 0 && (
          <DrillLensButtons
            drillLenses={uniqueDrillLenses}
            onSelect={setActiveDrillLens}
          />
        )}
      </Stack>
    </CardResultsContext.Provider>
  );
};

type DrillLensButtonsProps = {
  drillLenses: { id: string; display_name: string; description?: string }[];
  onSelect: (lensId: string) => void;
};

const DrillLensButtons = ({ drillLenses, onSelect }: DrillLensButtonsProps) => (
  <Flex gap="sm" wrap="wrap">
    {drillLenses.map((dl) => (
      <Button
        key={dl.id}
        variant="outline"
        size="sm"
        onClick={() => onSelect(dl.id)}
      >
        {dl.display_name}
      </Button>
    ))}
  </Flex>
);

type SectionsRendererProps = {
  lens: InspectorV2Lens;
  lensId: string;
  discovery: InspectorV2DiscoveryResponse;
};

const SectionsRenderer = ({ lens, lensId, discovery }: SectionsRendererProps) => {
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

const SectionRenderer = ({ section, cards, lensId, discovery }: SectionRendererProps) => {
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
