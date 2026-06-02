import cx from "classnames";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import type { MetabotToolCall } from "metabase/metabot/state";
import { Box, Flex, Text } from "metabase/ui";

import {
  METABOT_LOGO_MASK,
  METABOT_TOOL_MASKS,
  MetabotLoader,
  type MetabotLoaderMask,
} from "./MetabotLoader";
import S from "./MetabotThinking.module.css";

const TOOL_MASK_BY_NAME: Record<string, MetabotLoaderMask> = {
  analyze_chart: METABOT_TOOL_MASKS.chart,
  analyze_data: METABOT_TOOL_MASKS.chart,
  construct_notebook_query: METABOT_TOOL_MASKS.table,
  get_field_values: METABOT_TOOL_MASKS.table,
  get_transform_details: METABOT_TOOL_MASKS.docs,
  list_available_fields: METABOT_TOOL_MASKS.list,
  search: METABOT_TOOL_MASKS.search,
  search_data_sources: METABOT_TOOL_MASKS.search,
  search_metabase_documentation: METABOT_TOOL_MASKS.docs,
  search_tables: METABOT_TOOL_MASKS.table,
  search_transforms: METABOT_TOOL_MASKS.search,
  thinking: METABOT_LOGO_MASK,
  todo_read: METABOT_TOOL_MASKS.list,
  todo_write: METABOT_TOOL_MASKS.list,
  write_transform_python: METABOT_TOOL_MASKS.code,
  write_transform_sql: METABOT_TOOL_MASKS.code,
};

const getToolMask = (toolName: string) =>
  TOOL_MASK_BY_NAME[toolName] ?? METABOT_TOOL_MASKS.tool;

const POSITION_ANIMATION_MS = 260;

type LayoutPosition = {
  left: number;
  top: number;
};

const getLayoutPosition = (element: HTMLElement): LayoutPosition => ({
  left: element.offsetLeft,
  top: element.offsetTop,
});

const useAnimatedPosition = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const previousPositionRef = useRef<LayoutPosition>();
  const isAnimatingRef = useRef(false);
  const animationTimeoutRef = useRef<number>();

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const nextPosition = getLayoutPosition(element);
    const previousPosition = previousPositionRef.current;
    previousPositionRef.current = nextPosition;

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReducedMotion || !previousPosition) {
      return;
    }

    const deltaX = previousPosition.left - nextPosition.left;
    const deltaY = previousPosition.top - nextPosition.top;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }

    if (isAnimatingRef.current) {
      return;
    }

    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current);
    }

    isAnimatingRef.current = true;
    element.style.transition = "none";
    element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;

    // Force the inverted transform to apply before restoring the transition.
    void element.offsetHeight;

    element.style.transition = "";
    element.style.transform = "";

    animationTimeoutRef.current = window.setTimeout(() => {
      isAnimatingRef.current = false;
      animationTimeoutRef.current = undefined;
    }, POSITION_ANIMATION_MS);
  });

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  return elementRef;
};

// Per-character cadence: a snappy backspace, then a slightly more deliberate
// retype. Kept brisk so even the longest tool label ("Checking available data
// sources", 31 chars) finishes its delete+type well under a second.
const TYPE_DELETE_MS = 8;
const TYPE_WRITE_MS = 14;

const getCommonPrefixLength = (a: string, b: string) => {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) {
    i += 1;
  }
  return i;
};

/**
 * Renders `text`, animating any change like a typewriter: it backspaces the
 * current text down to the longest prefix shared with the new text, then types
 * the rest out. The first value shown appears instantly (no intro typing) so it
 * lines up with the loader's morph rather than typing on initial mount.
 */
const TypewriterText = ({
  text,
  className,
}: {
  text: string;
  className?: string;
}) => {
  const [displayed, setDisplayed] = useState(text);

  useEffect(() => {
    if (displayed === text) {
      return;
    }
    const prefix = getCommonPrefixLength(displayed, text);
    const deleting = displayed.length > prefix;
    const next = deleting
      ? displayed.slice(0, -1)
      : text.slice(0, displayed.length + 1);
    const timeout = window.setTimeout(
      () => setDisplayed(next),
      deleting ? TYPE_DELETE_MS : TYPE_WRITE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [displayed, text]);

  const isTyping = displayed !== text;

  return (
    <Text className={className} aria-label={text}>
      {displayed}
      <span className={cx(S.caret, isTyping && S.caretActive)} aria-hidden />
    </Text>
  );
};

const ToolCallRow = ({
  toolCall,
  dataTestId,
}: {
  toolCall: MetabotToolCall;
  dataTestId: string;
}) => {
  const label = toolCall.message ?? t`Thinking...`;

  return (
    <Flex
      align="center"
      className={cx(
        S.toolCallRow,
        toolCall.status === "ended" && S.toolCallRowEnded,
      )}
      data-tool-call-status={toolCall.status}
    >
      <MetabotLoader
        aria-label={label}
        className={S.toolCallIcon}
        data-testid={dataTestId}
        mask={getToolMask(toolCall.name)}
      />
      <TypewriterText className={S.toolCallText} text={label} />
    </Flex>
  );
};

export const MetabotThinking = ({
  toolCalls,
}: {
  toolCalls: MetabotToolCall[];
}) => {
  const latestToolCall = toolCalls[toolCalls.length - 1] ?? {
    id: "thinking",
    name: "thinking",
    message: undefined,
    status: "started" as const,
  };
  const fieldRef = useAnimatedPosition();

  return (
    <Box ref={fieldRef} className={S.field} mt="md">
      <Box className={S.content}>
        <ToolCallRow
          toolCall={latestToolCall}
          dataTestId="metabot-response-loader"
        />
      </Box>
    </Box>
  );
};
