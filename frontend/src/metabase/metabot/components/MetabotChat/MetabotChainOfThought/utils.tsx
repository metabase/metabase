import { Fragment } from "react";
import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { MarkdownSmartLink } from "metabase/metabot/components/AIMarkdown/components/MarkdownSmartLink";
import { getToolMessage } from "metabase/metabot/constants";
import type { MetabotChainStep } from "metabase/metabot/state";
import {
  METABSE_PROTOCOL_MD_LINK,
  type MetabaseProtocolEntityModel,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/metabot/utils/links";
import { isNotNull } from "metabase/utils/types";

import {
  REASONING_EXACT_THRESHOLD_MS,
  RESOURCE_TOOL_NAME,
  SAVE_ENTITY_TOOL_NAME,
  SEARCH_TOOL_NAME,
} from "./constants";

export type ToolChainStep = MetabotChainStep & { kind: "tool" };
export type ReasoningChainStep = MetabotChainStep & { kind: "reasoning" };

const SEARCH_MODEL_BY_METABOT_TYPE: Record<string, string> = {
  question: "card",
  model: "dataset",
};
export const toSearchModel = (type: string) =>
  SEARCH_MODEL_BY_METABOT_TYPE[type] ?? type;

export const resultContextParts = (result: SearchResultItem): string[] => {
  if (result.collection?.name) {
    return [result.collection.name];
  }
  return [result.database_name, result.database_schema].filter(
    (part): part is string => Boolean(part),
  );
};

export const activeToolLabel = (name: string) =>
  getToolMessage(name)?.active() ?? t`Thinking`;
export const doneToolLabel = (name: string) =>
  getToolMessage(name)?.done() ?? activeToolLabel(name);
export const isHiddenTool = (name: string) => {
  const message = getToolMessage(name);
  return !!message && message.active() === undefined;
};

export type TitleSegment =
  | { type: "text"; text: string }
  | {
      type: "link";
      id: number;
      name: string;
      model: MetabaseProtocolEntityModel;
    };

export const splitTitle = (title: string): TitleSegment[] => {
  const re = new RegExp(METABSE_PROTOCOL_MD_LINK.source, "g");
  const segments: TitleSegment[] = [];
  let lastIndex = 0;
  for (const match of title.matchAll(re)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: "text", text: title.slice(lastIndex, start) });
    }
    const parsed = parseMetabaseProtocolMarkdownLink(match[0]);
    segments.push(
      parsed
        ? { type: "link", ...parsed }
        : { type: "text", text: match.groups?.name ?? match[0] },
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < title.length) {
    segments.push({ type: "text", text: title.slice(lastIndex) });
  }
  return segments;
};

export const renderTitle = (title: string) =>
  splitTitle(title).map((seg, i) =>
    seg.type === "link" ? (
      <MarkdownSmartLink
        key={i}
        id={seg.id}
        name={seg.name}
        model={seg.model}
      />
    ) : (
      <Fragment key={i}>{seg.text}</Fragment>
    ),
  );

export const titledToolLabel = (
  step: ToolChainStep,
  done: boolean,
): string | null => {
  const { title } = step;
  if (!title) {
    return null;
  }
  return match(step.name)
    .with(SEARCH_TOOL_NAME, () =>
      done ? t`Searched for ${title}` : t`Searching for ${title}`,
    )
    .with(RESOURCE_TOOL_NAME, () =>
      done ? t`Read ${title}` : t`Reading ${title}`,
    )
    .with(SAVE_ENTITY_TOOL_NAME, () =>
      done ? t`Saved ${title}` : t`Saving ${title}`,
    )
    .otherwise(() => title);
};

export const searchResultCount = ({ totalCount }: { totalCount: number }) =>
  totalCount === 0
    ? t`No results`
    : ngettext(
        msgid`${totalCount} result`,
        `${totalCount} results`,
        totalCount,
      );

const previewLabel = (step: MetabotChainStep): string | undefined =>
  match(step)
    .with({ kind: "reasoning" }, ({ text }) =>
      text.trim() ? t`Thinking` : undefined,
    )
    .with(
      { kind: "tool", name: RESOURCE_TOOL_NAME },
      () => t`Reading resources`,
    )
    .with({ kind: "tool" }, ({ name }) =>
      isHiddenTool(name) ? undefined : activeToolLabel(name),
    )
    .exhaustive();

export const latestPreviewLabel = (steps: MetabotChainStep[]): string =>
  steps.map(previewLabel).filter(isNotNull).at(-1) ?? t`Thinking`;

export const isToolStep = (step: MetabotChainStep): step is ToolChainStep =>
  step.kind === "tool";

export const isRenderableStep = (step: MetabotChainStep) =>
  isToolStep(step)
    ? !!step.title || !!step.searchResults || !isHiddenTool(step.name)
    : !!step.text;

export const isResourceStep = (step: MetabotChainStep): step is ToolChainStep =>
  isToolStep(step) && step.name === RESOURCE_TOOL_NAME;

export type DisplayItem =
  | { kind: "reasoning"; step: ReasoningChainStep; index: number }
  | { kind: "tool"; step: ToolChainStep; index: number }
  | { kind: "resourceGroup"; steps: ToolChainStep[]; index: number };

const groupConsecutiveResources = (
  steps: MetabotChainStep[],
): MetabotChainStep[][] =>
  steps.reduce<MetabotChainStep[][]>((groups, step) => {
    const last = groups.at(-1);
    if (last && isResourceStep(step) && isResourceStep(last[0])) {
      return [...groups.slice(0, -1), [...last, step]];
    }
    return [...groups, [step]];
  }, []);

const toDisplayItem = (
  group: MetabotChainStep[],
  index: number,
): DisplayItem => {
  const [first] = group;
  if (first.kind === "reasoning") {
    return { kind: "reasoning", step: first, index };
  }
  const resources = group.filter(isResourceStep);
  return resources.length > 1
    ? { kind: "resourceGroup", steps: resources, index }
    : { kind: "tool", step: first, index };
};

const isRenderableItem = (item: DisplayItem): boolean =>
  item.kind === "resourceGroup" || isRenderableStep(item.step);

export const buildDisplayItems = (steps: MetabotChainStep[]): DisplayItem[] => {
  const groups = groupConsecutiveResources(steps);
  return groups
    .map((group, groupIndex) => {
      const stepIndex = groups.slice(0, groupIndex).flat().length;
      return toDisplayItem(group, stepIndex);
    })
    .filter(isRenderableItem);
};

export const soleReasoningStep = (
  items: DisplayItem[],
): ReasoningChainStep | null => {
  const [only] = items;
  return items.length === 1 && only.kind === "reasoning" ? only.step : null;
};

const exactSeconds = (durationMs: number | undefined): number | null =>
  durationMs != null && durationMs >= REASONING_EXACT_THRESHOLD_MS
    ? Math.round(durationMs / 1000)
    : null;

const thoughtFor = (seconds: number) =>
  ngettext(
    msgid`Thought for ${seconds} second`,
    `Thought for ${seconds} seconds`,
    seconds,
  );

const workedFor = (seconds: number) =>
  ngettext(
    msgid`Worked for ${seconds} second`,
    `Worked for ${seconds} seconds`,
    seconds,
  );

export const reasoningLabel = (durationMs: number | undefined): string => {
  const seconds = exactSeconds(durationMs);
  return seconds == null ? t`Thought briefly` : thoughtFor(seconds);
};

export const settledHeader = (
  durationMs: number | undefined,
  thinkingOnly: boolean,
): string => {
  if (durationMs == null) {
    return thinkingOnly ? t`Thought about it` : t`Worked on it`;
  }
  if (thinkingOnly) {
    return reasoningLabel(durationMs);
  }
  const seconds = exactSeconds(durationMs);
  return seconds == null ? t`Worked briefly` : workedFor(seconds);
};
