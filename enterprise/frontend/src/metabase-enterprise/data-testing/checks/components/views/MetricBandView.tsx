import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui";

import {
  type DataCheckBand,
  formatDataCheckBandValue,
  getDataCheckBand,
  getDataCheckDisplayStatus,
  getDataCheckStatusPresentation,
} from "../../utils";

import { FailingRowsView } from "./FailingRowsView";
import { GenericResultView } from "./GenericResultView";
import S from "./MetricBandView.module.css";
import type { DataCheckViewProps } from "./types";

const OUTSIDE_ZONE_PERCENT = 20;

export function MetricBandView(props: DataCheckViewProps) {
  const { definition, result, entry } = props;
  const band = entry ? getDataCheckBand(definition, result, entry) : null;
  if (band == null) {
    return <GenericResultView {...props} />;
  }
  const { color } = getDataCheckStatusPresentation(
    getDataCheckDisplayStatus(result),
  );
  const layout = getBandLayout(band);

  return (
    <Stack gap="md">
      <Group align="end" gap="sm">
        <Text fz="1.75rem" fw="bold" lh={1} c={color}>
          {formatDataCheckBandValue(band.value, band.format)}
        </Text>
        {band.unit != null && <Text c="text-secondary">{band.unit}</Text>}
        <Text c="text-secondary" ml="auto">
          {getBandDescription(band)}
        </Text>
      </Group>
      <Box
        role="img"
        aria-label={t`Measured value against the allowed band`}
        px="md"
      >
        <Box className={S.track}>
          <Box
            className={S.allowed}
            style={{
              left: `${layout.allowedStart}%`,
              width: `${layout.allowedEnd - layout.allowedStart}%`,
            }}
          />
          <Box
            className={S.marker}
            bg={color}
            style={{ left: `${layout.marker}%` }}
          />
        </Box>
        <Box className={S.labels} mt="xs">
          {band.min != null && (
            <Box
              className={S.label}
              style={{
                left: `${band.min === band.max ? (layout.allowedStart + layout.allowedEnd) / 2 : layout.allowedStart}%`,
              }}
            >
              {formatDataCheckBandValue(band.min, band.format)}
            </Box>
          )}
          {band.max != null && band.max !== band.min && (
            <Box className={S.label} style={{ left: `${layout.allowedEnd}%` }}>
              {formatDataCheckBandValue(band.max, band.format)}
            </Box>
          )}
        </Box>
      </Box>
      <FailingRowsView {...props} />
    </Stack>
  );
}

function getBandDescription({ min, max, format }: DataCheckBand) {
  const minLabel = min != null ? formatDataCheckBandValue(min, format) : null;
  const maxLabel = max != null ? formatDataCheckBandValue(max, format) : null;
  if (minLabel != null && maxLabel != null) {
    return minLabel === maxLabel
      ? t`Expected exactly ${minLabel}`
      : t`Expected between ${minLabel} and ${maxLabel}`;
  }
  return minLabel != null
    ? t`Expected at least ${minLabel}`
    : t`Expected at most ${maxLabel}`;
}

type BandLayout = {
  allowedStart: number;
  allowedEnd: number;
  marker: number;
};

function getBandLayout({ value, min, max }: DataCheckBand): BandLayout {
  const allowedStart = min != null ? OUTSIDE_ZONE_PERCENT : 0;
  const allowedEnd = max != null ? 100 - OUTSIDE_ZONE_PERCENT : 100;
  const allowedWidth = allowedEnd - allowedStart;

  if (min != null && value < min) {
    return { allowedStart, allowedEnd, marker: allowedStart / 2 };
  }
  if (max != null && value > max) {
    return { allowedStart, allowedEnd, marker: (allowedEnd + 100) / 2 };
  }
  return {
    allowedStart,
    allowedEnd,
    marker: allowedStart + allowedWidth * getPositionInBand(value, min, max),
  };
}

function getPositionInBand(value: number, min?: number, max?: number) {
  if (min != null && max != null) {
    return max === min ? 0.5 : (value - min) / (max - min);
  }
  if (max != null) {
    return max === 0 ? 0 : Math.min(1, Math.max(0, value / max));
  }
  if (min != null) {
    const distance = value - min;
    return distance / (distance + Math.max(Math.abs(min), 1));
  }
  return 0.5;
}
