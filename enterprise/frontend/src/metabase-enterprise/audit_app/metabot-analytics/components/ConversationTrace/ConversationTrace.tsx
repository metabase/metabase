import type { CustomSeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Badge, Box, Card, Code, Flex, Stack, Text, Title } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

import type { TraceSpan } from "../../types";

import S from "./ConversationTrace.module.css";
import type { Trace } from "./utils";
import { buildTraces, formatDurationMs, spanLabel } from "./utils";

const ROW_HEIGHT = 26;
const AXIS_HEIGHT = 44;
const GRID_LEFT = 8;
const GRID_RIGHT = 16;
const NAME_PADDING = 5;
// Vertical gap between stacked spans: the bar is drawn this much shorter than its
// lane band so adjacent spans don't sit flush.
const BAR_VGAP = 2;
// Slight corner rounding on each span bar.
const BAR_RADIUS = 2;
// Rough per-character widths (px) used to decide whether a bar can hold its
// label and/or duration. The name is preferred; the duration is only drawn when
// the whole name plus the duration fit inside the bar.
const NAME_CHAR_PX = 6.6;
const DURATION_CHAR_PX = 5.6;
const DURATION_GAP = 8;

export function ConversationTrace({ spans }: { spans: TraceSpan[] }) {
  const traces = useMemo(() => buildTraces(spans ?? []), [spans]);

  if (traces.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      <Title order={3}>{t`Trace`}</Title>
      <Text size="sm" c="text-secondary">
        {t`OpenTelemetry-style spans for each turn — when the request, each step, the model calls, and tool calls started and stopped.`}
      </Text>
      <Stack gap="lg">
        {traces.map((trace, i) => (
          <TraceWaterfall
            key={trace.traceId}
            trace={trace}
            turnNumber={traces.length - i}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function TraceWaterfall({
  trace,
  turnNumber,
}: {
  trace: Trace;
  turnNumber: number;
}) {
  const [selected, setSelected] = useState<TraceSpan | null>(null);
  const { rows } = trace;

  const option = useMemo<EChartsCoreOption>(() => {
    const labelColor = color("text-primary");
    const durationColor = color("text-secondary");

    const series: CustomSeriesOption = {
      type: "custom",
      clip: false,
      animationDuration: 0,
      // value = [lane, startMs, endMs]; greedy lane packing groups sequential
      // siblings onto one lane and only fans out genuinely parallel spans.
      encode: { x: [1, 2], y: 0 },
      data: rows.map((row) => ({
        value: [
          row.lane,
          row.offsetMs,
          row.offsetMs + Math.max(row.durationMs, 0),
        ],
      })),
      renderItem: (params, api) => {
        const row = rows[params.dataIndex];
        const lane = Number(api.value(0));
        const start = api.coord([Number(api.value(1)), lane]);
        const end = api.coord([Number(api.value(2)), lane]);
        const band = api.size?.([0, 1]);
        // Draw the bar shorter than its lane band, leaving BAR_VGAP px between
        // adjacent stacked spans.
        const bandHeight = Array.isArray(band) ? band[1] : ROW_HEIGHT;
        const barHeight = Math.max(bandHeight - BAR_VGAP, 1);
        const width = Math.max(end[0] - start[0], 2);
        const centerY = start[1];
        const fill =
          row.span.status === "error" ? color("error") : color("brand");
        const label = spanLabel(row.span);
        const durationText = formatDurationMs(row.durationMs);
        const inner = width - NAME_PADDING * 2;
        // Prefer the name; only show the duration if the whole name + duration fit.
        const showDuration =
          inner >=
          label.length * NAME_CHAR_PX +
            DURATION_GAP +
            durationText.length * DURATION_CHAR_PX;
        const nameWidth = Math.max(
          inner -
            (showDuration
              ? durationText.length * DURATION_CHAR_PX + DURATION_GAP
              : 0),
          0,
        );
        return {
          type: "group",
          // Keep the bar's own color on hover — the default emphasis state blanks
          // the fill. The tooltip still fires independently.
          emphasisDisabled: true,
          children: [
            {
              type: "rect",
              shape: {
                x: start[0],
                y: centerY - barHeight / 2,
                width,
                height: barHeight,
                r: BAR_RADIUS,
              },
              style: { fill },
            },
            // span name, inside the bar: left-aligned with a small padding and
            // truncated so it never overflows the span or the duration label.
            {
              type: "text",
              z2: 10,
              style: {
                text: label,
                x: start[0] + NAME_PADDING,
                y: centerY,
                textAlign: "left",
                textVerticalAlign: "middle",
                fill: labelColor,
                fontSize: 12,
                width: nameWidth,
                overflow: "truncate",
                ellipsis: "…",
              },
            },
            // duration, inside the bar on the right (only when it fits).
            ...(showDuration
              ? [
                  {
                    type: "text" as const,
                    z2: 10,
                    style: {
                      text: durationText,
                      x: end[0] - NAME_PADDING,
                      y: centerY,
                      textAlign: "right" as const,
                      textVerticalAlign: "middle" as const,
                      fill: durationColor,
                      fontSize: 11,
                    },
                  },
                ]
              : []),
          ],
        };
      },
    };

    return {
      grid: {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: 8,
        bottom: AXIS_HEIGHT - 8,
      },
      xAxis: {
        type: "value",
        min: 0,
        max: Math.max(trace.durationMs, 1),
        axisLabel: { formatter: (value: number) => formatDurationMs(value) },
        splitLine: { lineStyle: { color: color("border") } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: Array.from({ length: trace.laneCount }, (_value, i) => i),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { show: false },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: { dataIndex: number }) => {
          const row = rows[params.dataIndex];
          if (!row) {
            return "";
          }
          const { span } = row;
          return [
            `<strong>${spanLabel(span)}</strong>`,
            formatDurationMs(row.durationMs),
            span.status === "error" ? t`error` : "",
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      series: [series],
    };
  }, [rows, trace.durationMs, trace.laneCount]);

  const eventHandlers = useMemo<EChartsEventHandler[]>(
    () => [
      {
        eventName: "click",
        handler: (event) => {
          const row = rows[event.dataIndex];
          if (row) {
            setSelected(row.span);
          }
        },
      },
    ],
    [rows],
  );

  const [containerRef, width] = useElementWidth();
  const chartHeight = trace.laneCount * ROW_HEIGHT + AXIS_HEIGHT;

  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="sm">
        <Flex justify="space-between" align="center" gap="sm">
          <Text fw={700}>{t`Turn ${turnNumber}`}</Text>
          <Text size="sm" c="text-secondary">
            {formatDurationMs(trace.durationMs)} · {rows.length} {t`spans`}
          </Text>
        </Flex>
        <Box ref={containerRef} className={S.chart}>
          {width > 0 && (
            <EChartsRenderer
              option={option}
              eventHandlers={eventHandlers}
              width={width}
              height={chartHeight}
            />
          )}
        </Box>
        {selected && (
          <SpanDetail span={selected} onClose={() => setSelected(null)} />
        )}
      </Stack>
    </Card>
  );
}

function SpanDetail({
  span,
  onClose,
}: {
  span: TraceSpan;
  onClose: () => void;
}) {
  const durationMs =
    span.ended_at != null ? (span.ended_at - span.started_at) / 1e6 : null;
  const attributes = Object.entries(span.attributes ?? {});

  return (
    <Card withBorder shadow="none" p="md" className={S.detail}>
      <Stack gap="xs">
        <Flex justify="space-between" align="center">
          <Text fw={700}>{spanLabel(span)}</Text>
          <Text
            component="button"
            size="sm"
            c="brand"
            onClick={onClose}
            className={S.close}
          >
            {t`Close`}
          </Text>
        </Flex>
        <Flex gap="xs" align="center" wrap="wrap">
          {span.kind && <Badge variant="light">{span.kind}</Badge>}
          <Badge
            variant="light"
            bg={span.status === "error" ? "background-error" : undefined}
            c={span.status === "error" ? "error" : undefined}
          >
            {span.status ?? "unset"}
          </Badge>
          {durationMs != null && (
            <Text size="sm" c="text-secondary">
              {formatDurationMs(durationMs)}
            </Text>
          )}
        </Flex>
        {span.status_message && (
          <Text size="sm" c="error">
            {span.status_message}
          </Text>
        )}
        {attributes.length > 0 && (
          <Stack gap="xs" mt="xs">
            <Text fw={700} size="sm">{t`Attributes`}</Text>
            {attributes.map(([key, value]) => (
              <Box key={key}>
                <Text size="xs" c="text-secondary">
                  {key}
                </Text>
                <Code block className={S.code}>
                  {formatAttrValue(value)}
                </Code>
              </Box>
            ))}
          </Stack>
        )}
        {span.events && span.events.length > 0 && (
          <Stack gap="xs" mt="xs">
            <Text fw={700} size="sm">{t`Events`}</Text>
            {span.events.map((event, i) => (
              <Text key={i} size="xs">
                {event.name}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function formatAttrValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
