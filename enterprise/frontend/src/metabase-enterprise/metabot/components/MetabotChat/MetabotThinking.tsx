import cx from "classnames";

import { Loader, Stack, Text, Transition } from "metabase/ui";
import type { MetabotToolCall } from "metabase-enterprise/metabot/state";

import S from "./MetabotThinking.module.css";

const fadeDown = {
  in: { opacity: 1, transform: "translateY(0)" },
  out: { opacity: 0, transform: "translateY(-100%)" },
  transitionProperty: "opacity, transform",
};

const ThoughtProcess = ({ toolCalls }: { toolCalls: MetabotToolCall[] }) => {
  if (!toolCalls.length) {
    return null;
  }

  // transition must be mounted before tool call is provided
  // so render a couple more than needed
  const slots = new Array(toolCalls.length + 2).fill(null);

  return (
    <Stack gap={0} className={S.toolCalls}>
      {slots.map((_, i) => {
        const tc = toolCalls[i];
        return (
          <Transition
            key={i}
            mounted={!!tc}
            transition={fadeDown}
            duration={150}
          >
            {(styles) => (
              <Text
                style={styles}
                className={cx(tc.status === "started" && S.toolCallStarted)}
              >
                {tc.message}
              </Text>
            )}
          </Transition>
        );
      })}
    </Stack>
  );
};

export const MetabotThinking = ({
  toolCalls,
  hideLoader = false,
}: {
  toolCalls: MetabotToolCall[];
  hideLoader: boolean;
}) => {
  return (
    <Stack gap="xs">
      <ThoughtProcess toolCalls={toolCalls} />
      {!hideLoader && (
        <Loader
          color="brand"
          type="dots"
          size="lg"
          data-testid="metabot-response-loader"
        />
      )}
    </Stack>
  );
};
