import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import type { MetabotAgentChainOfThoughtMessage } from "metabase/metabot/state";
import { Collapse, Icon, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { ReasoningStep } from "./ReasoningStep";
import { ResourceGroupStep, ToolStep } from "./ToolStep";
import { useAutoCollapseOnSettle, useMeteredLabel, useNow } from "./hooks";
import {
  buildDisplayItems,
  isRenderableStep,
  isToolStep,
  latestPreviewLabel,
  reasoningLabel,
  settledHeader,
  soleReasoningStep,
} from "./utils";

export const MetabotChainOfThought = ({
  message,
  isStreaming,
}: {
  message: MetabotAgentChainOfThoughtMessage;
  isStreaming: boolean;
}) => {
  const { open, toggle } = useAutoCollapseOnSettle(isStreaming);
  const now = useNow(isStreaming);
  const preview = useMeteredLabel(latestPreviewLabel(message.steps));

  const renderableItems = buildDisplayItems(message.steps);

  if (!isStreaming && renderableItems.length === 0) {
    return null;
  }

  const durationMs =
    message.startedAtMs != null && message.endedAtMs != null
      ? message.endedAtMs - message.startedAtMs
      : undefined;

  const thinkingOnly = !message.steps.some(
    (step) => isToolStep(step) && isRenderableStep(step),
  );

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

  const soleReasoning = isStreaming ? null : soleReasoningStep(renderableItems);

  return (
    <div className={S.root} data-testid="metabot-chain-of-thought">
      <UnstyledButton
        className={S.trigger}
        aria-expanded={open}
        onClick={toggle}
        data-testid="metabot-chain-of-thought-header"
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
              <div className={cx(S.reasoningBody, Animation.fadeIn)}>
                <AIMarkdown>{soleReasoning.text}</AIMarkdown>
              </div>
            </div>
          ) : (
            renderableItems.map((item) =>
              match(item)
                .with({ kind: "resourceGroup" }, ({ steps, index }) => {
                  const active =
                    isStreaming &&
                    activeIndex >= index &&
                    activeIndex < index + steps.length;
                  return (
                    <div
                      key={`resource-${index}`}
                      className={cx(S.step, Animation.fadeIn)}
                    >
                      <ResourceGroupStep count={steps.length} done={!active} />
                    </div>
                  );
                })
                .with({ kind: "tool" }, ({ step, index }) => (
                  <div key={step.id} className={cx(S.step, Animation.fadeIn)}>
                    <ToolStep
                      step={step}
                      done={!isActive(index)}
                      animate={isStreaming}
                    />
                  </div>
                ))
                .with({ kind: "reasoning" }, ({ step, index }) => {
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
                .exhaustive(),
            )
          )}
        </Stack>
      </Collapse>
    </div>
  );
};
