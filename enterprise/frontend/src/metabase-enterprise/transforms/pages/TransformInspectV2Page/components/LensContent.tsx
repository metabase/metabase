import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  ActionIcon,
  Alert,
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
import { useGetInspectorLensQuery } from "metabase-enterprise/api";
import { evaluateTriggers } from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorDiscoveryResponse,
  InspectorLens,
  InspectorSection,
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
  lensId: string;
  cardResults: Record<string, Record<string, unknown>>;
  setCardResult: (cardId: string, result: Record<string, unknown>) => void;
};

const CardResultsContext = createContext<CardResultsContextType>({
  lensId: "",
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
  discovery: InspectorDiscoveryResponse;
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
  const {
    data: lens,
    isLoading,
    error,
  } = useGetInspectorLensQuery({
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

  // Evaluate triggers using cljs - returns full trigger objects
  const { activatedAlerts, activatedDrillLenses } = useMemo(() => {
    if (!lens) {
      return { activatedAlerts: [], activatedDrillLenses: [] };
    }
    const result = evaluateTriggers(lens, cardResults);
    return {
      activatedAlerts: result.alerts,
      activatedDrillLenses: result.drillLenses,
    };
  }, [lens, cardResults]);

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
    <CardResultsContext.Provider value={{ lensId, cardResults, setCardResult }}>
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

          {/* Triggered alerts */}
          {activatedAlerts.length > 0 && (
            <Stack gap="sm">
              {activatedAlerts.map((alert) => (
                <Alert
                  key={alert.id}
                  color={
                    alert.severity === "error"
                      ? "error"
                      : alert.severity === "warning"
                        ? "warning"
                        : "brand"
                  }
                  variant="light"
                >
                  {alert.message}
                </Alert>
              ))}
            </Stack>
          )}

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
  discovery: InspectorDiscoveryResponse;
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
  lens: InspectorLens;
  lensId: string;
  discovery: InspectorDiscoveryResponse;
};

const SectionsRenderer = ({
  lens,
  lensId,
  discovery,
}: SectionsRendererProps) => {
  const cardsBySection = useMemo(() => {
    const map = new Map<string, InspectorCard[]>();
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
  section: InspectorSection;
  cards: InspectorCard[];
  lensId: string;
  discovery: InspectorDiscoveryResponse;
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
