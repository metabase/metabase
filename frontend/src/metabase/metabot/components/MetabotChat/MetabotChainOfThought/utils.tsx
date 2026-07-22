import { Fragment } from "react";
import { msgid, ngettext, t } from "ttag";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { MarkdownSmartLink } from "metabase/metabot/components/AIMarkdown/components/MarkdownSmartLink";
import { TOOL_MESSAGES, type ToolMessage } from "metabase/metabot/constants";
import type { MetabotChainStep } from "metabase/metabot/state";
import {
  METABSE_PROTOCOL_MD_LINK,
  type MetabaseProtocolEntityModel,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/metabot/utils/links";

import {
  REASONING_EXACT_THRESHOLD_MS,
  RESOURCE_TOOL_NAME,
  SAVE_ENTITY_TOOL_NAME,
  SEARCH_TOOL_NAME,
} from "./constants";

export type ToolChainStep = MetabotChainStep & { kind: "tool" };
export type ReasoningChainStep = MetabotChainStep & { kind: "reasoning" };

// Metabot entity-type names -> the search "model" vocabulary modelToUrl/getIcon speak.
// No shared FE util exists: the app only ever uses card/dataset, this rename is the
// metabot boundary (the backend inverse lives in metabase.metabot.search-models).
const RESULT_MODEL: Record<string, string> = {
  question: "card",
  model: "dataset",
};
export const toModel = (type: string) => RESULT_MODEL[type] ?? type;

export const resultContextParts = (result: SearchResultItem): string[] => {
  if (result.collection?.name) {
    return [result.collection.name];
  }
  return [result.database_name, result.database_schema].filter(
    (part): part is string => Boolean(part),
  );
};

// widened view for lookups by dynamic (server-supplied) tool names
const messages: Record<string, ToolMessage | undefined> = TOOL_MESSAGES;

export const activeToolLabel = (name: string) =>
  messages[name]?.active() ?? t`Thinking`;
export const doneToolLabel = (name: string) =>
  messages[name]?.done() ?? activeToolLabel(name);
// a tool that's known but maps to no label is shown silently (previewed as "Thinking")
export const isHiddenTool = (name: string) => {
  const message = messages[name];
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

// search & read_resource stream just the *object* (the query / the entities) as
// their title; the FE owns the verb + tense so the same object reads present while
// the step runs ("Searching for orders") and past once it settles ("Searched for
// orders"). null for any other tool (their title, if any, is shown verbatim).
export const specificLabel = (
  step: ToolChainStep,
  done: boolean,
): string | null => {
  if (!step.title) {
    return null;
  }
  if (step.name === SEARCH_TOOL_NAME) {
    return done
      ? t`Searched for ${step.title}`
      : t`Searching for ${step.title}`;
  }
  if (step.name === RESOURCE_TOOL_NAME) {
    return done ? t`Read ${step.title}` : t`Reading ${step.title}`;
  }
  // save_entity's title (a metabase:// entity link) only arrives once the card
  // exists, so a running save has no title and reads the generic "Saving"
  if (step.name === SAVE_ENTITY_TOOL_NAME) {
    return done ? t`Saved ${step.title}` : t`Saving ${step.title}`;
  }
  return step.title;
};

export const searchResultCount = ({ totalCount }: { totalCount: number }) =>
  totalCount === 0
    ? t`No results`
    : ngettext(
        msgid`${totalCount} result`,
        `${totalCount} results`,
        totalCount,
      );

// the collapsed header always previews the latest step in the present tense —
// reasoning is never echoed verbatim, it just reads "Thinking…". walk back past
// hidden/empty steps to the first that has something to say.
export const latestPreviewLabel = (steps: MetabotChainStep[]): string => {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.kind === "reasoning") {
      if (step.text.trim()) {
        return t`Thinking`;
      }
      continue;
    }
    if (step.name === RESOURCE_TOOL_NAME) {
      // stays generic at the top level; the expanded rows name the entities
      return t`Reading resources`;
    }
    if (!isHiddenTool(step.name)) {
      return activeToolLabel(step.name);
    }
  }
  return t`Thinking`;
};

export const isRenderableStep = (s: MetabotChainStep) =>
  s.kind === "tool"
    ? !!s.title || !!s.searchResults || !isHiddenTool(s.name)
    : !!s.text;

export const isResourceStep = (s: MetabotChainStep): s is ToolChainStep =>
  s.kind === "tool" && s.name === RESOURCE_TOOL_NAME;

// a group of consecutive read_resource calls renders as one aggregated row;
// index is the position of its first step (for shimmer/keying)
export type DisplayItem =
  | { kind: "reasoning"; step: ReasoningChainStep; index: number }
  | { kind: "tool"; step: ToolChainStep; index: number }
  | { kind: "resourceGroup"; steps: ToolChainStep[]; index: number };

// consecutive read_resource steps collapse into one run; everything else stays a
// singleton run, preserving order
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
  // only consecutive resource reads ever group, so a >1 run is always a burst;
  // a lone resource read keeps its own tool row (and any entity-link title)
  const resources = group.filter(isResourceStep);
  return resources.length > 1
    ? { kind: "resourceGroup", steps: resources, index }
    : { kind: "tool", step: first, index };
};

export const buildDisplayItems = (steps: MetabotChainStep[]): DisplayItem[] =>
  groupConsecutiveResources(steps).reduce<{
    items: DisplayItem[];
    offset: number;
  }>(
    ({ items, offset }, group) => ({
      items: [...items, toDisplayItem(group, offset)],
      offset: offset + group.length,
    }),
    { items: [], offset: 0 },
  ).items;

export const isRenderableItem = (item: DisplayItem): boolean =>
  item.kind === "resourceGroup" || isRenderableStep(item.step);

// a rollup phrased as "Worked" (or "Thought" for a thinking-only turn), rolled up
// to "briefly" under the exact-seconds threshold
export const settledHeader = (
  durationMs: number | undefined,
  thinkingOnly: boolean,
): string => {
  if (durationMs == null) {
    return thinkingOnly ? t`Thought about it` : t`Worked on it`;
  }
  if (durationMs < REASONING_EXACT_THRESHOLD_MS) {
    return thinkingOnly ? t`Thought briefly` : t`Worked briefly`;
  }
  const seconds = Math.round(durationMs / 1000);
  return thinkingOnly
    ? ngettext(
        msgid`Thought for ${seconds} second`,
        `Thought for ${seconds} seconds`,
        seconds,
      )
    : ngettext(
        msgid`Worked for ${seconds} second`,
        `Worked for ${seconds} seconds`,
        seconds,
      );
};

export const reasoningLabel = (durationMs: number | undefined): string => {
  if (durationMs != null && durationMs >= REASONING_EXACT_THRESHOLD_MS) {
    const secs = Math.round(durationMs / 1000);
    return ngettext(
      msgid`Thought for ${secs} second`,
      `Thought for ${secs} seconds`,
      secs,
    );
  }
  return t`Thought briefly`;
};
