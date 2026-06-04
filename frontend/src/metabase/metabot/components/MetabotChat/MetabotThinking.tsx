import cx from "classnames";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import type { MetabotToolCall } from "metabase/metabot/state";
import { Box, Flex, Text } from "metabase/ui";

import { REVEAL_TIMELINES } from "./MetabotDotField/reveal-timeline";
import {
  METABOT_EMPTY_MASK,
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

const POSITION_MAX_PX_PER_SECOND = 900;
const POSITION_MAX_FRAME_MS = 30;
const POSITION_EPSILON_PX = 0.5;
export const METABOT_THINKING_EXIT_MS = REVEAL_TIMELINES.text.duration;

type LayoutPosition = {
  left: number;
  top: number;
};

const getLayoutPosition = (element: HTMLElement): LayoutPosition => ({
  left: element.offsetLeft,
  top: element.offsetTop,
});

const distance = (a: LayoutPosition, b: LayoutPosition) =>
  Math.hypot(b.left - a.left, b.top - a.top);

const setVisualPosition = (
  element: HTMLElement,
  visual: LayoutPosition,
  target: LayoutPosition,
) => {
  const dx = visual.left - target.left;
  const dy = visual.top - target.top;
  if (
    Math.abs(dx) < POSITION_EPSILON_PX &&
    Math.abs(dy) < POSITION_EPSILON_PX
  ) {
    element.style.transform = "";
  } else {
    element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }
};

const useAnimatedPosition = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const visualPositionRef = useRef<LayoutPosition>();
  const rafRef = useRef<number>();
  const lastAnimationTimeRef = useRef<number>();
  const syncVisualToLayoutRef = useRef<() => void>(() => {});

  const animate = (ts: number) => {
    const element = elementRef.current;
    const visual = visualPositionRef.current;
    if (!element || !visual) {
      rafRef.current = undefined;
      lastAnimationTimeRef.current = undefined;
      return;
    }

    const previousTs = lastAnimationTimeRef.current ?? ts;
    const dt = Math.min(POSITION_MAX_FRAME_MS, Math.max(0, ts - previousTs));
    lastAnimationTimeRef.current = ts;

    const target = getLayoutPosition(element);
    const remaining = distance(visual, target);
    if (remaining <= POSITION_EPSILON_PX) {
      visualPositionRef.current = target;
      element.style.transform = "";
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const step = Math.min(remaining, (POSITION_MAX_PX_PER_SECOND * dt) / 1000);
    const progress = step / remaining;
    const nextVisual = {
      left: visual.left + (target.left - visual.left) * progress,
      top: visual.top + (target.top - visual.top) * progress,
    };

    visualPositionRef.current = nextVisual;
    setVisualPosition(element, nextVisual, target);
    rafRef.current = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (rafRef.current == null) {
      lastAnimationTimeRef.current = undefined;
      rafRef.current = requestAnimationFrame(animate);
    }
  };

  syncVisualToLayoutRef.current = () => {
    const element = elementRef.current;
    const visual = visualPositionRef.current;
    if (!element || !visual) {
      return;
    }

    setVisualPosition(element, visual, getLayoutPosition(element));
    startAnimation();
  };

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const nextPosition = getLayoutPosition(element);
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReducedMotion) {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      visualPositionRef.current = nextPosition;
      element.style.transform = "";
      return;
    }

    if (!visualPositionRef.current) {
      visualPositionRef.current = nextPosition;
      element.style.transform = "";
      startAnimation();
      return;
    }

    setVisualPosition(element, visualPositionRef.current, nextPosition);
    startAnimation();
  });

  useLayoutEffect(() => {
    const parent = elementRef.current?.parentElement;
    if (
      !parent ||
      typeof ResizeObserver === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }

    const syncVisualToLayout = () => syncVisualToLayoutRef.current();
    const resizeObserver = new ResizeObserver(syncVisualToLayout);
    const mutationObserver = new MutationObserver(syncVisualToLayout);
    resizeObserver.observe(parent);
    mutationObserver.observe(parent, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
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
  isExiting,
}: {
  toolCall: MetabotToolCall;
  dataTestId: string;
  isExiting: boolean;
}) => {
  const label = isExiting ? "" : (toolCall.message ?? t`Thinking...`);

  return (
    <Flex
      align="center"
      className={cx(
        S.toolCallRow,
        toolCall.status === "ended" && S.toolCallRowEnded,
        isExiting && S.toolCallRowExiting,
      )}
      data-tool-call-status={toolCall.status}
    >
      <MetabotLoader
        aria-label={label}
        aria-hidden={isExiting || undefined}
        className={S.toolCallIcon}
        data-testid={dataTestId}
        data-metabot-loader-state={isExiting ? "exiting" : "active"}
        mask={isExiting ? METABOT_EMPTY_MASK : getToolMask(toolCall.name)}
      />
      <TypewriterText className={S.toolCallText} text={label} />
    </Flex>
  );
};

export const MetabotThinking = ({
  toolCalls,
  isExiting = false,
  onExitComplete,
}: {
  toolCalls: MetabotToolCall[];
  isExiting?: boolean;
  onExitComplete?: () => void;
}) => {
  const latestToolCall = toolCalls[toolCalls.length - 1] ?? {
    id: "thinking",
    name: "thinking",
    message: undefined,
    status: "started" as const,
  };
  const previousToolCallRef = useRef<MetabotToolCall>(latestToolCall);
  if (!isExiting) {
    previousToolCallRef.current = latestToolCall;
  }
  const visibleToolCall = isExiting
    ? previousToolCallRef.current
    : latestToolCall;
  const fieldRef = useAnimatedPosition();

  useEffect(() => {
    if (!isExiting) {
      return;
    }
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReducedMotion) {
      onExitComplete?.();
      return;
    }
    const timeout = window.setTimeout(
      () => onExitComplete?.(),
      METABOT_THINKING_EXIT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [isExiting, onExitComplete]);

  return (
    <Box
      ref={fieldRef}
      className={cx(S.field, isExiting && S.fieldExiting)}
      mt="xl"
      data-metabot-thinking-state={isExiting ? "exiting" : "active"}
    >
      <Box className={S.content}>
        <ToolCallRow
          toolCall={visibleToolCall}
          dataTestId="metabot-response-loader"
          isExiting={isExiting}
        />
      </Box>
    </Box>
  );
};
