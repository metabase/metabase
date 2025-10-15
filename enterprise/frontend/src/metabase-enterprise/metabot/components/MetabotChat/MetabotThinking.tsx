import cx from "classnames";
import { useMemo } from "react";

import { Box, Loader, Stack, Text, Transition } from "metabase/ui";
import type { MetabotToolCall } from "metabase-enterprise/metabot/state";

import styles from "metabase/css/core/animation.module.css";
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

const Beaker = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="24"
      height="24"
    >
      <path
        d="M 5.5 9 L 5.5 11 C 5.5 11.8 6.2 12.5 7 12.5 L 9 12.5 C 9.8 12.5 10.5 11.8 10.5 11 L 10.5 9 Z"
        fill="currentcolor"
      />

      <path
        d="M 5 4 L 5 11 C 5 12.1 6 13 7 13 L 9 13 C 10 13 11 12.1 11 11 L 11 4"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      <line
        x1="4"
        y1="4"
        x2="12"
        y2="4"
        stroke="currentcolor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      <circle
        className={`${styles.bubble} ${styles.bubble1}`}
        cx="7"
        cy="8"
        r="0.8"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
      <circle
        className={`${styles.bubble} ${styles.bubble2}`}
        cx="9"
        cy="8.5"
        r="0.8"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
      <circle
        className={`${styles.bubble} ${styles.bubble3}`}
        cx="8"
        cy="7.5"
        r="0.6"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
    </svg>
  );
};

export const MetabotThinking = ({
  toolCalls,
}: {
  toolCalls: MetabotToolCall[];
}) => {
  const toolCallsWithMsgs = useMemo(() => {
    return toolCalls.filter((tc) => !!tc.message);
  }, [toolCalls]);

  return (
    <Stack gap="xs">
      <ThoughtProcess toolCalls={toolCallsWithMsgs} />
      <Box>
        <Beaker />
      </Box>
    </Stack>
  );
};
