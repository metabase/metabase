import cx from "classnames";
import { Fragment, useEffect, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { Link } from "metabase/common/components/Link";
import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import { MarkdownSmartLink } from "metabase/metabot/components/AIMarkdown/components/MarkdownSmartLink";
import {
  PREVIEW_MIN_MS,
  REASONING_EXACT_THRESHOLD_MS,
  RESOURCE_TOOL_MESSAGES,
  RESOURCE_TOOL_NAME,
  TOOL_CALL_DONE_MESSAGES,
  TOOL_CALL_MESSAGES,
} from "metabase/metabot/constants";
import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotChainStep,
} from "metabase/metabot/state";
import {
  METABSE_PROTOCOL_MD_LINK,
  type MetabaseProtocolEntityModel,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/metabot/utils/links";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import type { IconName } from "metabase-types/api";

import S from "./MetabotChainOfThought.module.css";

// Metabot entity-type names -> the search "model" vocabulary modelToUrl speaks
const RESULT_MODEL: Record<string, string> = {
  question: "card",
  model: "dataset",
};
const toModel = (type: string) => RESULT_MODEL[type] ?? type;

const RESULT_ICON: Record<string, IconName> = {
  card: "table2",
  dataset: "model",
  metric: "metric",
  dashboard: "dashboard",
  table: "table",
  transform: "transform",
};

const resultContextParts = (result: SearchResultItem): string[] => {
  if (result.collection?.name) {
    return [result.collection.name];
  }
  return [result.database_name, result.database_schema].filter(
    (part): part is string => Boolean(part),
  );
};

const ResultContext = ({ result }: { result: SearchResultItem }) => {
  const parts = resultContextParts(result);
  if (parts.length === 0) {
    return null;
  }
  return (
    <Text component="span" className={S.resultContext} lh="inherit">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={S.contextSeparator} aria-hidden>
              /
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </Text>
  );
};

const SearchResultRow = ({
  result,
  index,
  animate,
}: {
  result: SearchResultItem;
  index: number;
  animate: boolean;
}) => {
  const model = toModel(result.type);
  return (
    <Link
      to={modelToUrl({
        id: result.id,
        model,
        name: result.name,
        database_id: result.database_id,
      })}
      className={cx(S.resultRow, animate && S.resultRowIn)}
      style={
        animate
          ? { animationDelay: `${Math.min(index * 45, 360)}ms` }
          : undefined
      }
    >
      <Icon
        name={RESULT_ICON[model] ?? "document"}
        size={13}
        className={S.resultIcon}
      />
      <Text component="span" className={S.resultName} c="inherit" lh="inherit">
        {result.display_name ?? result.name}
      </Text>
      <ResultContext result={result} />
    </Link>
  );
};

const SearchResultsList = ({
  step,
  animate,
}: {
  step: MetabotChainStep & { kind: "tool" };
  animate: boolean;
}) => {
  if (!step.searchResults || step.searchResults.results.length === 0) {
    return null;
  }
  return (
    <div className={S.resultsList}>
      {step.searchResults.results.map((result, i) => (
        <SearchResultRow
          key={`${result.type}-${result.id}`}
          result={result}
          index={i}
          animate={animate}
        />
      ))}
    </div>
  );
};

type ToolChainStep = MetabotChainStep & { kind: "tool" };
type ReasoningChainStep = MetabotChainStep & { kind: "reasoning" };

// widened views for lookups by dynamic (server-supplied) tool names
const activeMessages: Record<string, string | undefined> = TOOL_CALL_MESSAGES;
const doneMessages: Record<string, string | undefined> =
  TOOL_CALL_DONE_MESSAGES;

const activeToolLabel = (name: string) => activeMessages[name] ?? t`Thinking`;
const doneToolLabel = (name: string) =>
  doneMessages[name] ?? activeToolLabel(name);

// tools mapped to an explicit undefined label are hidden by design
const isHiddenTool = (name: string) =>
  name in activeMessages && activeMessages[name] === undefined;

// re-renders on a slow tick while the turn is live so elapsed-time thresholds
// (e.g. reasoning duration) cross even with no streaming events
const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(id);
  }, [active]);
  return now;
};

// meters a stream of preview labels: each is held on screen for at least
// PREVIEW_MIN_MS before the next replaces it, so a burst of fast tool calls
// doesn't flash by unreadably. labels that pile up during a hold are queued,
// never dropped, so each one still gets its moment.
const useMeteredLabel = (target: string): string => {
  const [shown, setShown] = useState(target);
  const queueRef = useRef<string[]>([]);
  const lastRef = useRef(target);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (target === lastRef.current) {
      return;
    }
    lastRef.current = target;
    if (lockedRef.current) {
      queueRef.current.push(target);
    } else {
      lockedRef.current = true;
      setShown(target);
    }
  }, [target]);

  useEffect(() => {
    if (!lockedRef.current) {
      return;
    }
    const id = setTimeout(() => {
      const next = queueRef.current.shift();
      if (next === undefined) {
        lockedRef.current = false;
      } else {
        setShown(next);
      }
    }, PREVIEW_MIN_MS);
    return () => clearTimeout(id);
  }, [shown]);

  return shown;
};

type TitleSegment =
  | { type: "text"; text: string }
  | {
      type: "link";
      id: number;
      name: string;
      model: MetabaseProtocolEntityModel;
    };

const splitTitle = (title: string): TitleSegment[] => {
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

const renderTitle = (title: string) =>
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

const SEARCH_TOOL_NAME = "search";
const SAVE_ENTITY_TOOL_NAME = "save_entity";

// search & read_resource stream just the *object* (the query / the entities) as
// their title; the FE owns the verb + tense so the same object reads present
// while the step runs ("Searching for orders", "Reading Orders columns") and
// past once it settles ("Searched for orders", "Read Orders columns"). null for
// any other tool (their title, if any, is shown verbatim).
const specificLabel = (step: ToolChainStep, done: boolean): string | null => {
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

const searchResultCount = ({ totalCount }: { totalCount: number }) =>
  totalCount === 0
    ? t`No results`
    : ngettext(
        msgid`${totalCount} result`,
        `${totalCount} results`,
        totalCount,
      );

const toolLabelContent = (step: ToolChainStep, done: boolean) => {
  // search reads "Searching for orders" / "Searched for orders", trailed by a
  // muted result count once the hits are in
  if (step.name === SEARCH_TOOL_NAME) {
    const label =
      specificLabel(step, done) ?? (done ? t`Searched` : t`Searching`);
    return (
      <>
        {renderTitle(label)}
        {step.searchResults && (
          <span className={S.resultCount}>
            {searchResultCount(step.searchResults)}
          </span>
        )}
      </>
    );
  }
  const specific = specificLabel(step, done);
  if (specific) {
    return renderTitle(specific);
  }
  return done ? doneToolLabel(step.name) : activeToolLabel(step.name);
};

const ToolStepLabel = ({
  step,
  done,
  className,
}: {
  step: ToolChainStep;
  done: boolean;
  className?: string;
}) => (
  <Text component="span" className={className} c="inherit" lh="inherit">
    {toolLabelContent(step, done)}
  </Text>
);

// the collapsed header always previews the latest step in the present tense —
// reasoning is never echoed verbatim, it just reads "Thinking…". walk back past
// hidden/empty steps to the first that has something to say.
const latestPreviewLabel = (steps: MetabotChainStep[]): string => {
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

// a burst of near-instant read_resource calls, collapsed into one row
const ResourceGroupStep = ({
  count,
  done,
}: {
  count: number;
  done: boolean;
}) => (
  <div className={S.toolStep}>
    <div className={cx(S.toolRow, S.toolRowStatic)}>
      <Text component="span" c="inherit">
        {done
          ? RESOURCE_TOOL_MESSAGES.done(count)
          : RESOURCE_TOOL_MESSAGES.active(count)}
      </Text>
    </div>
  </div>
);

// a tool step is itself a collapse: the label is always shown, its results
// (search hits) stay hidden until the row is expanded
const ToolStep = ({
  step,
  done,
  animate,
}: {
  step: ToolChainStep;
  done: boolean;
  animate: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const hasResults = !!step.searchResults?.results.length;

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={cx(S.toolRow, !hasResults && S.toolRowStatic)}
        component={hasResults ? "button" : "div"}
        aria-expanded={hasResults ? open : undefined}
        onClick={hasResults ? () => setOpen((prev) => !prev) : undefined}
      >
        <ToolStepLabel step={step} done={done} />
        {hasResults && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, open && S.chevronOpen)}
          />
        )}
      </UnstyledButton>
      {hasResults && (
        <Collapse in={open}>
          <SearchResultsList step={step} animate={animate} />
        </Collapse>
      )}
    </div>
  );
};

// reasoning is tucked away behind a duration-based collapse ("Thought briefly",
// or the exact seconds once it runs long) and stays collapsed by default;
// active only drives the reasoning text streaming.
const ReasoningStep = ({
  text,
  label,
  active,
}: {
  text: string;
  label: string;
  active: boolean;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={S.toolRow}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Text component="span" c="inherit" lh="inherit">
          {label}
        </Text>
        <Icon
          name="chevronright"
          size={10}
          className={cx(S.chevron, open && S.chevronOpen)}
        />
      </UnstyledButton>
      <Collapse in={open}>
        <div className={S.reasoningBody}>
          <AIMarkdown isStreaming={active} animateFromStart>
            {text}
          </AIMarkdown>
        </div>
      </Collapse>
    </div>
  );
};

const isRenderableStep = (s: MetabotChainStep) =>
  s.kind === "tool"
    ? !!s.title || !!s.searchResults || !isHiddenTool(s.name)
    : !!s.text;

// a group of consecutive read_resource calls renders as one aggregated row;
// index is the position of its first step (for shimmer/keying)
type DisplayItem =
  | { kind: "reasoning"; step: ReasoningChainStep; index: number }
  | { kind: "tool"; step: ToolChainStep; index: number }
  | { kind: "resourceGroup"; steps: ToolChainStep[]; index: number };

const isResourceStep = (s: MetabotChainStep): s is ToolChainStep =>
  s.kind === "tool" && s.name === RESOURCE_TOOL_NAME;

const buildDisplayItems = (steps: MetabotChainStep[]): DisplayItem[] => {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    const isResource = step.kind === "tool" && step.name === RESOURCE_TOOL_NAME;
    if (isResource) {
      const start = i;
      const group: ToolChainStep[] = [];
      while (i < steps.length) {
        const next = steps[i];
        if (!isResourceStep(next)) {
          break;
        }
        group.push(next);
        i++;
      }
      // a lone resource read keeps its own row (and any entity-link title); only
      // a genuine burst collapses into the aggregated count
      if (group.length > 1) {
        items.push({ kind: "resourceGroup", steps: group, index: start });
      } else {
        items.push({ kind: "tool", step: group[0], index: start });
      }
      continue;
    }
    items.push(
      step.kind === "tool"
        ? { kind: "tool", step, index: i }
        : { kind: "reasoning", step, index: i },
    );
    i++;
  }
  return items;
};

const isRenderableItem = (item: DisplayItem): boolean =>
  item.kind === "resourceGroup" || isRenderableStep(item.step);

export const MetabotChainOfThought = ({
  message,
  isStreaming,
}: {
  message: MetabotAgentChainOfThoughtMessage;
  isStreaming: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const now = useNow(isStreaming);

  // collapse the chain once — the first time it settles — so a mid-stream peek
  // doesn't linger. isStreaming can toggle false more than once as later
  // messages arrive, so we latch to avoid fighting a user who reopens it.
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (!isStreaming && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setOpen(false);
    }
  }, [isStreaming]);

  // the collapsed header previews the latest step, metered so fast bursts stay
  // readable and always phrased in the present tense
  const preview = useMeteredLabel(latestPreviewLabel(message.steps));

  if (message.steps.length === 0 && !isStreaming) {
    return null;
  }

  const durationMs =
    message.startedAtMs != null && message.endedAtMs != null
      ? message.endedAtMs - message.startedAtMs
      : undefined;

  // the verb swaps to "Thought" when the whole turn was reasoning — no tool ran
  const thinkingOnly = !message.steps.some(
    (step) => step.kind === "tool" && isRenderableStep(step),
  );

  // the current (latest) step. it always reads in the present tense while the
  // turn is live and its label shimmers; only once a newer step supersedes it
  // does it settle into the past tense.
  const activeIndex = message.steps.reduce(
    (acc, step, i) => (isRenderableStep(step) ? i : acc),
    -1,
  );
  const isActive = (index: number) => isStreaming && index === activeIndex;

  // once settled: a rollup phrased as "Worked" (or "Thought" for a thinking-only
  // turn), rolled up to "briefly" under the exact-seconds threshold
  const settledHeader = (): string => {
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

  const headerContent = isStreaming ? preview : settledHeader();

  const reasoningLabel = (step: ReasoningChainStep, index: number): string => {
    const start = step.startedAtMs;
    const end =
      message.steps[index + 1]?.startedAtMs ??
      message.endedAtMs ??
      (isStreaming ? now : undefined);
    const durationMs = start != null && end != null ? end - start : undefined;
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

  const displayItems = buildDisplayItems(message.steps);
  // a turn that was a single thinking event: skip the redundant collapse row
  // (its label would just echo the header's "Thought briefly") and show the
  // reasoning inline instead
  const renderableItems = displayItems.filter(isRenderableItem);
  const soleReasoning =
    renderableItems.length === 1 && renderableItems[0].kind === "reasoning"
      ? renderableItems[0].step
      : null;

  return (
    <div className={S.root} data-testid="metabot-chain-of-thought">
      <UnstyledButton
        className={S.trigger}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Text
          component="span"
          className={cx(S.headerLabel, isStreaming && S.shimmer)}
          c="currentColor"
        >
          {headerContent}
        </Text>
        <Icon
          name="chevronright"
          size={10}
          className={cx(S.chevron, Animation.fadeIn, open && S.chevronOpen)}
        />
      </UnstyledButton>
      <Collapse in={open}>
        <div className={S.timeline}>
          {soleReasoning ? (
            <div className={S.step}>
              <div className={S.reasoningBody}>
                <AIMarkdown isStreaming={isStreaming} animateFromStart>
                  {soleReasoning.text}
                </AIMarkdown>
              </div>
            </div>
          ) : (
            displayItems.map((item) => {
              if (item.kind === "resourceGroup") {
                const active =
                  isStreaming &&
                  activeIndex >= item.index &&
                  activeIndex < item.index + item.steps.length;
                return (
                  <div
                    key={`resource-${item.index}`}
                    className={cx(S.step, S.stepIn)}
                  >
                    <ResourceGroupStep
                      count={item.steps.length}
                      done={!active}
                    />
                  </div>
                );
              }
              if (item.kind === "tool") {
                const { step, index } = item;
                if (!isRenderableStep(step)) {
                  return null;
                }
                const active = isActive(index);
                return (
                  <div key={step.id} className={cx(S.step, S.stepIn)}>
                    <ToolStep
                      step={step}
                      done={!active}
                      animate={isStreaming}
                    />
                  </div>
                );
              }
              const { step, index } = item;
              const active = isActive(index);
              if (!step.text) {
                return null;
              }
              return (
                <div key={`reasoning-${index}`} className={S.step}>
                  <ReasoningStep
                    text={step.text}
                    label={active ? t`Thinking` : reasoningLabel(step, index)}
                    active={active}
                  />
                </div>
              );
            })
          )}
        </div>
      </Collapse>
    </div>
  );
};
