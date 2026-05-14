import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  Icon,
  Select,
  TextInput,
  Textarea,
} from "metabase/ui";

import type { MetricCell, Slide } from "../../types";

import S from "./SlideDataPanel.module.css";

interface SlideDataPanelProps {
  slide: Slide;
  onChange: (data: Slide["data"]) => void;
}

const layoutLabel = (l: string) => l.replace(/_/g, " ");

export const SlideDataPanel = ({ slide, onChange }: SlideDataPanelProps) => {
  return (
    <Box className={S.panel}>
      <span className={S.layoutBadge}>
        <Icon name="document" size={10} />
        {layoutLabel(slide.layout)}
      </span>
      <DataFields slide={slide} onChange={onChange} />
    </Box>
  );
};

const DataFields = ({ slide, onChange }: SlideDataPanelProps) => {
  const patch = (partial: Record<string, unknown>) =>
    onChange({ ...slide.data, ...partial } as Slide["data"]);

  switch (slide.layout) {
    case "cover":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <TextAreaField
            label={t`Subtitle`}
            value={slide.data.subtitle ?? ""}
            onChange={(v) => patch({ subtitle: v })}
          />
          <Box className={S.field}>
            <span className={S.fieldLabel}>{t`Accent`}</span>
            <Select
              value={slide.data.accent ?? "violet"}
              data={[
                { value: "violet", label: t`Violet` },
                { value: "sunset", label: t`Sunset` },
                { value: "ocean", label: t`Ocean` },
                { value: "forest", label: t`Forest` },
              ]}
              onChange={(v) => patch({ accent: v ?? "violet" })}
            />
          </Box>
        </>
      );
    case "closing":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <TextAreaField
            label={t`Subtitle`}
            value={slide.data.subtitle ?? ""}
            onChange={(v) => patch({ subtitle: v })}
          />
        </>
      );
    case "bullets":
      return (
        <>
          <TextField
            label={t`Eyebrow`}
            value={slide.data.eyebrow ?? ""}
            onChange={(v) => patch({ eyebrow: v })}
          />
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <BulletsField
            value={slide.data.bullets}
            onChange={(v) => patch({ bullets: v })}
          />
        </>
      );
    case "big_quote":
      return (
        <>
          <TextAreaField
            label={t`Quote`}
            value={slide.data.quote}
            onChange={(v) => patch({ quote: v })}
            minRows={3}
          />
          <TextField
            label={t`Attribution`}
            value={slide.data.attribution ?? ""}
            onChange={(v) => patch({ attribution: v })}
          />
        </>
      );
    case "chart_hero":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <NumberField
            label={t`Card ID`}
            value={slide.data.card_id}
            onChange={(v) => patch({ card_id: v })}
          />
          <TextAreaField
            label={t`Caption`}
            value={slide.data.caption ?? ""}
            onChange={(v) => patch({ caption: v })}
          />
        </>
      );
    case "metrics_grid":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <MetricsField
            value={slide.data.metrics}
            onChange={(v) => patch({ metrics: v })}
          />
        </>
      );
    case "title_metrics_with_chart":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <TextAreaField
            label={t`Description`}
            value={slide.data.description ?? ""}
            onChange={(v) => patch({ description: v })}
          />
          <NumberField
            label={t`Card ID`}
            value={slide.data.card_id}
            onChange={(v) => patch({ card_id: v })}
          />
          <MetricsField
            value={slide.data.metrics}
            onChange={(v) => patch({ metrics: v })}
          />
        </>
      );
    case "two_column":
      return (
        <>
          <TextField
            label={t`Title`}
            value={slide.data.title}
            onChange={(v) => patch({ title: v })}
          />
          <BulletsField
            value={slide.data.bullets}
            onChange={(v) => patch({ bullets: v })}
          />
          <NumberField
            label={t`Card ID`}
            value={slide.data.card_id}
            onChange={(v) => patch({ card_id: v })}
          />
        </>
      );
    default:
      return null;
  }
};

/* ─── Reusable field components ──────────────────────────────────────────── */

const TextField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <Box className={S.field}>
    <span className={S.fieldLabel}>{label}</span>
    <TextInput
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  </Box>
);

const TextAreaField = ({
  label,
  value,
  onChange,
  minRows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}) => (
  <Box className={S.field}>
    <span className={S.fieldLabel}>{label}</span>
    <Textarea
      value={value}
      autosize
      minRows={minRows}
      maxRows={6}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  </Box>
);

const NumberField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) => (
  <Box className={S.field}>
    <span className={S.fieldLabel}>{label}</span>
    <TextInput
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.currentTarget.value || 0))}
    />
  </Box>
);

const BulletsField = ({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) => (
  <Box className={S.field}>
    <span className={S.fieldLabel}>{t`Bullets`}</span>
    <Box className={S.bulletsList}>
      {value.map((b, i) => (
        <Box key={i} className={S.bulletRow}>
          <TextInput
            value={b}
            onChange={(e) => {
              const next = value.slice();
              next[i] = e.currentTarget.value;
              onChange(next);
            }}
          />
          {value.length > 2 && (
            <button
              type="button"
              className={S.removeBulletBtn}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              aria-label={t`Remove bullet`}
            >
              ×
            </button>
          )}
        </Box>
      ))}
    </Box>
    {value.length < 5 && (
      <Button
        variant="subtle"
        size="xs"
        leftSection={<Icon name="add" size={10} />}
        onClick={() => onChange([...value, ""])}
      >
        {t`Add bullet`}
      </Button>
    )}
  </Box>
);

const MetricsField = ({
  value,
  onChange,
}: {
  value: MetricCell[];
  onChange: (v: MetricCell[]) => void;
}) => (
  <Box className={S.field}>
    <span className={S.fieldLabel}>{t`Metrics`}</span>
    <Box className={S.metricsList}>
      {value.map((m, i) => (
        <Box className={S.metricRow} key={i}>
          <Box className={S.metricRowHeader}>
            <span>
              {t`Metric`} {i + 1}
            </span>
            {value.length > 2 && (
              <ActionIcon
                variant="subtle"
                size="xs"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                aria-label={t`Remove`}
              >
                <Icon name="close" size={10} />
              </ActionIcon>
            )}
          </Box>
          <TextInput
            placeholder={t`Value (e.g. $1.2M)`}
            value={m.value}
            onChange={(e) => {
              const next = value.slice();
              next[i] = { ...m, value: e.currentTarget.value };
              onChange(next);
            }}
          />
          <TextInput
            placeholder={t`Label`}
            value={m.label}
            onChange={(e) => {
              const next = value.slice();
              next[i] = { ...m, label: e.currentTarget.value };
              onChange(next);
            }}
          />
          <TextInput
            placeholder={t`Card ID (optional, replaces value with chart)`}
            type="number"
            value={m.card_id ?? ""}
            onChange={(e) => {
              const next = value.slice();
              const n = Number(e.currentTarget.value || 0);
              next[i] = { ...m, card_id: n || null };
              onChange(next);
            }}
          />
        </Box>
      ))}
    </Box>
    {value.length < 6 && (
      <Button
        variant="subtle"
        size="xs"
        leftSection={<Icon name="add" size={10} />}
        onClick={() =>
          onChange([...value, { value: "—", label: t`New metric` }])
        }
      >
        {t`Add metric`}
      </Button>
    )}
  </Box>
);
