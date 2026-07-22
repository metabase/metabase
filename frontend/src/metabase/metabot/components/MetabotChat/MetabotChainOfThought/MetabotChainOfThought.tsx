import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import type { MetabotAgentChainOfThoughtMessage } from "metabase/metabot/state";
import { Collapse, Icon, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { ReasoningStep } from "./ReasoningStep";
import { ResourceGroupStep, ToolStep } from "./ToolStep";
import { useMeteredLabel, useNow } from "./hooks";
import {
  buildDisplayItems,
  isRenderableItem,
  isRenderableStep,
  latestPreviewLabel,
  reasoningLabel,
  settledHeader,
} from "./utils";

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
  // doesn't linger. isStreaming can toggle false more than once as later messages
  // arrive, so we latch to avoid fighting a user who reopens it.
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (!isStreaming && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setOpen(false);
    }
  }, [isStreaming]);

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

  // the current (latest) step reads in the present tense while the turn is live
  // and its label shimmers; only once a newer step supersedes it does it settle
  // into the past tense.
  const activeIndex = message.steps.reduce(
    (acc, step, i) => (isRenderableStep(step) ? i : acc),
    -1,
  );
  const isActive = (index: number) => isStreaming && index === activeIndex;

  const headerContent = isStreaming
    ? preview
    : settledHeader(durationMs, thinkingOnly);

  const stepReasoningLabel = (index: number): string => {
    const start = message.steps[index].startedAtMs;
    const end =
      message.steps[index + 1]?.startedAtMs ??
      message.endedAtMs ??
      (isStreaming ? now : undefined);
    return reasoningLabel(
      start != null && end != null ? end - start : undefined,
    );
  };

  const displayItems = buildDisplayItems(message.steps);
  // a turn that was a single thinking event: skip the redundant collapse row (its
  // label would just echo the header's "Thought briefly") and show reasoning inline
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
          className={cx(
            S.chevron,
            Animation.fadeIn,
            isStreaming && S.chevronShimmer,
            open && S.chevronOpen,
          )}
        />
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap="0.5rem" mt="0.5rem">
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
                    className={cx(S.step, Animation.fadeIn)}
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
                return (
                  <div key={step.id} className={cx(S.step, Animation.fadeIn)}>
                    <ToolStep
                      step={step}
                      done={!isActive(index)}
                      animate={isStreaming}
                    />
                  </div>
                );
              }
              const { step, index } = item;
              if (!step.text) {
                return null;
              }
              const active = isActive(index);
              return (
                <div key={`reasoning-${index}`} className={S.step}>
                  <ReasoningStep
                    text={step.text}
                    label={active ? t`Thinking` : stepReasoningLabel(index)}
                    active={active}
                  />
                </div>
              );
            })
          )}
        </Stack>
      </Collapse>
    </div>
  );
};
