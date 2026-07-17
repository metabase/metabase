import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import {
  DEFAULT_TOOL_CALL_ICON,
  TOOL_CALL_ICONS,
  TOOL_CALL_MESSAGES,
} from "metabase/metabot/constants";
import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotChainStep,
} from "metabase/metabot/state";
import { Collapse, Icon, Loader, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";

const toolLabel = (name: string) => TOOL_CALL_MESSAGES[name] ?? t`Working`;

// live headline: the current reasoning block's first line, else the active
// tool's status, else nothing
const summarize = (steps: MetabotChainStep[]): string | undefined => {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.kind === "reasoning") {
      const firstLine = (step.text.split(/\r?\n/)[0] ?? "")
        .replace(/^[#>\-*\s]+/, "")
        .replace(/[*_`]/g, "")
        .trim();
      if (firstLine) {
        return firstLine;
      }
    }
    if (step.kind === "tool") {
      return toolLabel(step.name);
    }
  }
  return undefined;
};

const StepMarker = ({ step }: { step: MetabotChainStep }) => {
  if (step.kind === "reasoning") {
    return <Icon name="metabot" size={13} c="currentColor" />;
  }
  if (step.status === "started") {
    return <Loader size="xs" color="currentColor" />;
  }
  return (
    <Icon
      name={TOOL_CALL_ICONS[step.name] ?? DEFAULT_TOOL_CALL_ICON}
      size={13}
      c="currentColor"
    />
  );
};

export const MetabotChainOfThought = ({
  message,
  isStreaming,
}: {
  message: MetabotAgentChainOfThoughtMessage;
  isStreaming: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [capturedEndMs, setCapturedEndMs] = useState<number>();
  const wasStreaming = useRef(isStreaming);

  // capture when the turn moves on, as a fallback for the redux-stamped time
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) {
      setCapturedEndMs(Date.now());
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  // while the turn is live the shell shows "Thinking…" even before the first
  // step; a settled chain with no steps is never rendered (it gets dropped)
  if (message.steps.length === 0 && !isStreaming) {
    return null;
  }

  const endedAtMs = message.endedAtMs ?? capturedEndMs;
  const seconds =
    message.startedAtMs != null && endedAtMs != null
      ? Math.max(1, Math.round((endedAtMs - message.startedAtMs) / 1000))
      : undefined;

  const headerLabel = isStreaming
    ? (summarize(message.steps) ?? t`Thinking…`)
    : seconds != null
      ? ngettext(
          msgid`Thought for ${seconds} second`,
          `Thought for ${seconds} seconds`,
          seconds,
        )
      : t`Thought about it`;

  const lastIndex = message.steps.length - 1;

  return (
    <div className={S.root} data-testid="metabot-chain-of-thought">
      <UnstyledButton
        className={S.trigger}
        onClick={() => setOpen((prev) => !prev)}
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
          {headerLabel}
        </Text>
        <Icon
          name="chevrondown"
          size={12}
          className={cx(S.chevron, open && S.chevronOpen)}
        />
      </UnstyledButton>
      <Collapse in={open}>
        <div className={S.timeline}>
          {message.steps.map((step, index) => {
            if (step.kind === "reasoning" && !step.text) {
              return null;
            }
            const key = step.kind === "tool" ? step.id : `reasoning-${index}`;
            return (
              <div key={key} className={S.step}>
                <div className={S.marker}>
                  <StepMarker step={step} />
                </div>
                <div className={S.stepContent}>
                  {step.kind === "tool" ? (
                    <Text component="span" c="inherit" lh="inherit">
                      {toolLabel(step.name)}
                    </Text>
                  ) : (
                    <AIMarkdown
                      isStreaming={isStreaming && index === lastIndex}
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
