import cx from "classnames";
import { Fragment, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { Link } from "metabase/common/components/Link";
import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import { MarkdownSmartLink } from "metabase/metabot/components/AIMarkdown/components/MarkdownSmartLink";
import {
  DEFAULT_TOOL_CALL_ICON,
  TOOL_CALL_ICONS,
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
import {
  Collapse,
  Icon,
  Loader,
  Paper,
  Text,
  UnstyledButton,
} from "metabase/ui";
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
            <Icon name="chevronright" size={8} className={S.contextSeparator} />
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

const SearchResultsCard = ({
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
    <Paper withBorder shadow="none" radius="md" className={S.resultsCard}>
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
    </Paper>
  );
};

const toolLabel = (name: string) => TOOL_CALL_MESSAGES[name] ?? t`Working`;

// tools mapped to an explicit undefined label are hidden by design
const isHiddenTool = (name: string) =>
  name in TOOL_CALL_MESSAGES && TOOL_CALL_MESSAGES[name] === undefined;

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

const ToolStepLabel = ({
  step,
}: {
  step: MetabotChainStep & { kind: "tool" };
}) => (
  <Text component="span" c="inherit" lh="inherit">
    {step.title
      ? splitTitle(step.title).map((seg, i) =>
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
        )
      : toolLabel(step.name)}
  </Text>
);

// live headline: the latest reasoning line, else the active tool step
type HeaderSummary =
  | { kind: "text"; text: string }
  | { kind: "tool"; step: MetabotChainStep & { kind: "tool" } };

const summarize = (steps: MetabotChainStep[]): HeaderSummary | undefined => {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.kind === "reasoning") {
      const firstLine = (step.text.split(/\r?\n/)[0] ?? "")
        .replace(/^[#>\-*\s]+/, "")
        .replace(/[*_`]/g, "")
        .trim();
      if (firstLine) {
        return { kind: "text", text: firstLine };
      }
    }
    if (step.kind === "tool" && (step.title || !isHiddenTool(step.name))) {
      return { kind: "tool", step };
    }
  }
  return undefined;
};

const ToolStepMarker = ({
  step,
}: {
  step: MetabotChainStep & { kind: "tool" };
}) => (
  <div className={cx(S.marker, S.toolMarker)}>
    <Icon
      name={TOOL_CALL_ICONS[step.name] ?? DEFAULT_TOOL_CALL_ICON}
      size={13}
      c="currentColor"
    />
  </div>
);

export const MetabotChainOfThought = ({
  message,
  isStreaming,
}: {
  message: MetabotAgentChainOfThoughtMessage;
  isStreaming: boolean;
}) => {
  const [open, setOpen] = useState(false);

  if (message.steps.length === 0 && !isStreaming) {
    return null;
  }

  const seconds =
    message.startedAtMs != null && message.endedAtMs != null
      ? Math.max(
          1,
          Math.round((message.endedAtMs - message.startedAtMs) / 1000),
        )
      : undefined;

  // while expanded the timeline shows the reasoning itself, so the header
  // falls back to "Thinking…" instead of echoing it
  const summary = isStreaming && !open ? summarize(message.steps) : undefined;
  const headerContent = isStreaming ? (
    summary ? (
      summary.kind === "tool" ? (
        <ToolStepLabel step={summary.step} />
      ) : (
        summary.text
      )
    ) : (
      t`Thinking…`
    )
  ) : seconds != null ? (
    ngettext(
      msgid`Thought for ${seconds} second`,
      `Thought for ${seconds} seconds`,
      seconds,
    )
  ) : (
    t`Thought about it`
  );

  const lastIndex = message.steps.length - 1;

  const isRenderable = (s: MetabotChainStep) =>
    s.kind === "tool"
      ? !!s.title || !!s.searchResults || !isHiddenTool(s.name)
      : !!s.text;
  const firstRenderable = message.steps.find(isRenderable);
  const firstIsReasoning = firstRenderable?.kind === "reasoning";
  const canToggle = firstRenderable != null;
  const lastRenderable = message.steps.findLast(isRenderable);
  const lastExtendsLine =
    lastRenderable?.kind === "reasoning" ||
    (lastRenderable?.kind === "tool" &&
      !!lastRenderable.searchResults?.results.length);

  return (
    <div className={S.root} data-testid="metabot-chain-of-thought">
      <UnstyledButton
        className={cx(S.trigger, !canToggle && S.triggerStatic)}
        component={canToggle ? "button" : "div"}
        aria-expanded={canToggle ? open : undefined}
        onClick={canToggle ? () => setOpen((prev) => !prev) : undefined}
      >
        {isStreaming && (
          <Loader
            size="xs"
            type="dots"
            color="currentColor"
            className={S.headerLoader}
          />
        )}
        <Text component="span" className={S.headerLabel} c="currentColor">
          {headerContent}
        </Text>
        {canToggle && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, Animation.fadeIn, open && S.chevronOpen)}
          />
        )}
      </UnstyledButton>
      <Collapse in={open}>
        <div
          className={cx(
            S.timeline,
            firstIsReasoning && S.timelineReasoningFirst,
            lastExtendsLine && S.timelineFlushBottom,
          )}
        >
          {message.steps.map((step, index) => {
            if (!isRenderable(step)) {
              return null;
            }
            const key = step.kind === "tool" ? step.id : `reasoning-${index}`;
            return (
              <div
                key={key}
                className={cx(S.step, step.kind === "tool" && S.stepIn)}
              >
                {step.kind === "tool" ? (
                  <ToolStepMarker step={step} />
                ) : (
                  <div className={S.marker} />
                )}
                <div className={S.stepContent}>
                  {step.kind === "tool" ? (
                    <>
                      <div className={S.toolRow}>
                        <ToolStepLabel step={step} />
                        {step.searchResults && (
                          <Text
                            component="span"
                            className={S.resultCount}
                            c="inherit"
                          >
                            {step.searchResults.totalCount === 0
                              ? t`No results`
                              : ngettext(
                                  msgid`${step.searchResults.totalCount} result`,
                                  `${step.searchResults.totalCount} results`,
                                  step.searchResults.totalCount,
                                )}
                          </Text>
                        )}
                      </div>
                      {step.searchResults && (
                        <SearchResultsCard step={step} animate={isStreaming} />
                      )}
                    </>
                  ) : (
                    <AIMarkdown
                      isStreaming={isStreaming && index === lastIndex}
                      animateFromStart
                    >
                      {step.text}
                    </AIMarkdown>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
};
