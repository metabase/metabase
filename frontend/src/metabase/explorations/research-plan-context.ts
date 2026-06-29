import type { ExplorationBlock } from "metabase/explorations/hooks";
import { isMetricBlock } from "metabase/explorations/hooks";
import type {
  MetricDimension,
  ResearchPlanContext,
  ResearchPlanGroup,
  Timeline,
} from "metabase-types/api";

function dimensionName(dimension: MetricDimension): string {
  return dimension.display_name || dimension.name;
}

function blockToGroup(block: ExplorationBlock): ResearchPlanGroup {
  if (isMetricBlock(block)) {
    return {
      block_id: block.id,
      anchor: "metric",
      metric: { id: block.metric.id, name: block.metric.name },
      dimensions: block.dimensions
        .filter((d) => block.selectedDimensionIds.has(d.id))
        .map((d) => ({ id: d.id, name: dimensionName(d) })),
    };
  }
  return {
    block_id: block.id,
    anchor: "dimension",
    dimension: { id: block.dimension.id, name: dimensionName(block.dimension) },
    metrics: block.metrics
      .filter((m) => block.selectedMetricIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name })),
  };
}

/**
 * Serialize the in-progress draft Research plan into the shape Metabot reads from its chat
 * context. Plan-only: only the selected members of each block are included (the agent gets the
 * full catalog of candidates from `get_research_candidates`). The agent addresses blocks by the
 * stable `block_id`s emitted here.
 */
export function selectionToResearchPlanContext({
  blocks,
  timelines,
  name,
}: {
  blocks: ExplorationBlock[];
  timelines: Timeline[];
  name: string;
}): ResearchPlanContext {
  return {
    name,
    groups: blocks.map(blockToGroup),
    timelines: timelines.map((t) => ({ id: t.id, name: t.name })),
  };
}
