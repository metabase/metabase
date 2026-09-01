import cx from "classnames";
import { match } from "ts-pattern";

import Animation from "metabase/css/core/animation.module.css";
import type { MetabotAgentChainOfThoughtMessage } from "metabase/metabot/state";
import { Loader, Stack } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { ResourceGroupStep, ToolStep } from "./ToolStep";
import { buildDisplayItems, isRenderableStep } from "./utils";

export const MetabotToolProgress = ({
  message,
  isStreaming,
}: {
  message: MetabotAgentChainOfThoughtMessage;
  isStreaming: boolean;
}) => {
  if (!isStreaming) {
    return null;
  }

  const activeIndex = message.steps.findLastIndex(isRenderableStep);

  return (
    <Stack gap="0.5rem" data-testid="metabot-tool-progress">
      {buildDisplayItems(message.steps).map((item) =>
        match(item)
          .with({ kind: "resourceGroup" }, ({ steps, index }) => (
            <div
              key={`resource-${index}`}
              className={cx(S.step, Animation.fadeIn)}
            >
              <ResourceGroupStep
                count={steps.length}
                done={
                  activeIndex < index || activeIndex >= index + steps.length
                }
              />
            </div>
          ))
          .with({ kind: "tool" }, ({ step, index }) => (
            <div key={step.id} className={cx(S.step, Animation.fadeIn)}>
              <ToolStep step={step} done={index !== activeIndex} animate />
            </div>
          ))
          .with({ kind: "reasoning" }, () => null)
          .exhaustive(),
      )}
      <Loader
        type="dots"
        size="lg"
        color="core-brand"
        data-testid="metabot-response-loader"
      />
    </Stack>
  );
};
