import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  type OverviewEntityType,
  type OverviewJudgement,
  type OverviewJudgementAxis,
  type OverviewJudgementVerdict,
  useCreateOverviewJudgementMutation,
  useListOverviewJudgementsQuery,
} from "metabase/api";
import { getUserId } from "metabase/current-user";
import { CARD_GENERATORS } from "metabase/metric-cube-viewer/generators";
import { useSelector } from "metabase/redux";
import { useNavigate, useParams, useSearchParams } from "metabase/router";
import {
  Box,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  DEFAULT_VIZ_HEURISTIC_ID,
  type VizHeuristic,
  VizHeuristicProvider,
  type VizReport,
  getVizHeuristic,
} from "metabase/visualizations/lib/viz-heuristics";
import { VerdictButtons } from "metabase/viz-ab/VerdictButtons";

import { ArmControl } from "./components/ArmControl";
import { DataStrip } from "./components/DataStrip";
import { EntitySelect } from "./components/EntitySelect";
import { OverviewContent } from "./components/OverviewContent";
import { Tally } from "./components/Tally";
import { useArmParams } from "./hooks/use-arm-params";
import { useOverviewEntity } from "./hooks/use-overview-entity";
import { usePageHotkeys } from "./hooks/use-page-hotkeys";
import {
  BASELINE_GENERATOR_ID,
  ENTITY_TYPES,
  GEN_SEARCH_PARAM,
  VIZ_SEARCH_PARAM,
  getEntityTypeLabel,
  getVerdictOptions,
  isEntityType,
  parseEntityId,
} from "./types";

const DEFAULT_ENTITY_TYPE: OverviewEntityType = "table";
const DEFAULT_NEW_VIZ_HEURISTIC_ID = "default-viz-v1";

function getNewGeneratorOptions(entityType: OverviewEntityType) {
  if (entityType !== "table") {
    return [];
  }
  return CARD_GENERATORS.filter(
    (generator) => generator.id !== BASELINE_GENERATOR_ID.table,
  ).map((generator) => ({ value: generator.id, label: generator.name }));
}

type VizSideProps = {
  label: string;
  heuristic: VizHeuristic;
  onReport: (report: VizReport) => void;
  withDivider?: boolean;
  children: React.ReactNode;
};

function VizSide({
  label,
  heuristic,
  onReport,
  withDivider,
  children,
}: VizSideProps) {
  return (
    <Stack
      gap={0}
      mih={0}
      h="100%"
      style={{
        borderRight: withDivider ? "1px solid var(--mb-color-border)" : "none",
      }}
    >
      <Group
        px="md"
        py="xs"
        gap="xs"
        bg="background_page-secondary"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Text size="sm" fw="bold">
          {label}
        </Text>
        <Text size="sm" c="text-secondary">
          {heuristic.label}
        </Text>
      </Group>
      <Box flex={1} mih={0} style={{ overflow: "auto" }}>
        <VizHeuristicProvider heuristic={heuristic} onReport={onReport}>
          {children}
        </VizHeuristicProvider>
      </Box>
    </Stack>
  );
}

export function OverviewAbPage() {
  const params = useParams<{ entityType?: string; id?: string }>();
  const routeEntityType = isEntityType(params.entityType)
    ? params.entityType
    : undefined;
  const entityId = routeEntityType ? parseEntityId(params.id) : undefined;
  const [entityType, setEntityType] = useState<OverviewEntityType>(
    routeEntityType ?? DEFAULT_ENTITY_TYPE,
  );
  useEffect(() => {
    if (routeEntityType) {
      setEntityType(routeEntityType);
    }
  }, [routeEntityType]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goTo = useCallback(
    (type: OverviewEntityType, id: number | undefined) => {
      const pathname =
        id != null
          ? `/_internal/overview/${type}/${id}`
          : "/_internal/overview";
      navigate({ pathname, search: searchParams.toString() });
    },
    [navigate, searchParams],
  );

  const newGeneratorOptions = useMemo(
    () => getNewGeneratorOptions(entityType),
    [entityType],
  );
  const generation = useArmParams({
    param: GEN_SEARCH_PARAM,
    baselineId: BASELINE_GENERATOR_ID[entityType],
    newOptions: newGeneratorOptions,
  });
  // Old and new visualization heuristics render side by side; `?viz=` can
  // still swap the new side without any UI for it.
  const baselineVizHeuristic = useMemo(
    () => getVizHeuristic(DEFAULT_VIZ_HEURISTIC_ID),
    [],
  );
  const newVizParam = searchParams.get(VIZ_SEARCH_PARAM);
  const newVizHeuristic = useMemo(
    () => getVizHeuristic(newVizParam ?? DEFAULT_NEW_VIZ_HEURISTIC_ID),
    [newVizParam],
  );

  const entity = useOverviewEntity(routeEntityType, entityId);
  const { data: judgements } = useListOverviewJudgementsQuery();
  const [createJudgement, { isLoading: isSaving }] =
    useCreateOverviewJudgementMutation();
  const userId = useSelector(getUserId);
  const [note, setNote] = useState("");

  // Every tile rendered under a provider reports its display decision, per
  // side; both batches reset whenever the thing being judged changes.
  const baselineTileReports = useRef(new Map<string, VizReport>());
  const newTileReports = useRef(new Map<string, VizReport>());
  useEffect(() => {
    baselineTileReports.current = new Map();
    newTileReports.current = new Map();
  }, [entityType, entityId, generation.activeId, newVizHeuristic.id]);
  const collectBaselineTileReport = useCallback((report: VizReport) => {
    baselineTileReports.current.set(report.tileId, report);
  }, []);
  const collectNewTileReport = useCallback((report: VizReport) => {
    newTileReports.current.set(report.tileId, report);
  }, []);

  const canJudge = entityId != null && !isSaving;

  const submitVerdict = useCallback(
    (axis: OverviewJudgementAxis, verdict: OverviewJudgementVerdict) => {
      if (entityId == null) {
        return;
      }
      const body: OverviewJudgement = {
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entity.name ?? null,
        axis,
        verdict,
        gen: generation.activeId,
        baseline_gen: BASELINE_GENERATOR_ID[entityType],
        viz: newVizHeuristic.id,
        baseline_viz: baselineVizHeuristic.id,
        tiles: Array.from(newTileReports.current.values()),
        baseline_tiles: Array.from(baselineTileReports.current.values()),
        note: note || null,
        user_id: userId ?? null,
        created_at: new Date().toISOString(),
      };
      createJudgement(body);
      setNote("");
    },
    [
      entityType,
      entityId,
      entity.name,
      generation.activeId,
      newVizHeuristic.id,
      baselineVizHeuristic.id,
      note,
      userId,
      createJudgement,
    ],
  );
  const submitGenerationVerdict = useCallback(
    (verdict: OverviewJudgementVerdict) => submitVerdict("generation", verdict),
    [submitVerdict],
  );
  const submitVisualizationVerdict = useCallback(
    (verdict: OverviewJudgementVerdict) =>
      submitVerdict("visualization", verdict),
    [submitVerdict],
  );

  const generationDisabledReason =
    entityType === "table" ? undefined : t`Comes in round 2`;
  const hotkeys = useMemo(
    () => ({
      g: generationDisabledReason ? undefined : generation.toggleArm,
    }),
    [generationDisabledReason, generation.toggleArm],
  );
  usePageHotkeys(hotkeys, true);

  const generationOptions = useMemo(() => getVerdictOptions("generation"), []);
  const visualizationOptions = useMemo(
    () => getVerdictOptions("visualization"),
    [],
  );

  return (
    <Stack h="100%" gap={0} data-testid="overview-ab-page">
      <Group
        px="md"
        py="xs"
        gap="md"
        wrap="wrap"
        align="center"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <SegmentedControl
          size="xs"
          data={ENTITY_TYPES.map((type) => ({
            value: type,
            label: getEntityTypeLabel(type),
          }))}
          value={entityType}
          onChange={(value) => {
            if (isEntityType(value)) {
              setEntityType(value);
              goTo(value, undefined);
            }
          }}
        />
        <EntitySelect
          entityType={entityType}
          entityId={entityId}
          entityName={entity.name}
          onPick={(id) => goTo(entityType, id)}
        />
        <ArmControl
          label={t`Generation`}
          hotkey="g"
          arm={generation.arm}
          newId={generation.newId}
          newOptions={newGeneratorOptions}
          onArmChange={generation.setArm}
          onNewIdChange={generation.setNewId}
          disabledReason={generationDisabledReason}
        />
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" fw="bold">{t`Gen:`}</Text>
          <VerdictButtons
            size="compact-xs"
            options={generationOptions}
            disabled={!canJudge}
            onSelect={submitGenerationVerdict}
          />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" fw="bold">{t`Viz:`}</Text>
          <VerdictButtons
            size="compact-xs"
            options={visualizationOptions}
            disabled={!canJudge}
            onSelect={submitVisualizationVerdict}
          />
        </Group>
        <TextInput
          size="xs"
          w="10rem"
          placeholder={t`Note`}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <Tally judgements={judgements} />
      </Group>

      <SimpleGrid
        cols={2}
        spacing={0}
        flex={1}
        mih={0}
        style={{ overflow: "hidden" }}
      >
        <VizSide
          label={t`Old visualization`}
          heuristic={baselineVizHeuristic}
          onReport={collectBaselineTileReport}
          withDivider
        >
          <OverviewContent
            entityType={entityType}
            entityId={entityId}
            generatorId={generation.activeId}
          />
        </VizSide>
        <VizSide
          label={t`New visualization`}
          heuristic={newVizHeuristic}
          onReport={collectNewTileReport}
        >
          <OverviewContent
            entityType={entityType}
            entityId={entityId}
            generatorId={generation.activeId}
          />
        </VizSide>
      </SimpleGrid>

      <DataStrip card={entity.rowsCard} />
    </Stack>
  );
}
