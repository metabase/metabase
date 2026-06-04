import cx from "classnames";
import { t } from "ttag";

import {
  Ellipsified,
  Group,
  Icon,
  Pill,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Timeline } from "metabase-types/api";

import S from "./NewExplorationData.module.css";

/** How many selected pills to show on a collapsed block before "+N". */
const COLLAPSED_PILL_LIMIT = 3;

interface SelectedPill {
  label: string;
  interestingness?: number | null;
}

interface SelectedPillsProps {
  pills: SelectedPill[];
}

/** Collapsed view: plain, non-removable pills for the selected children. */
export function SelectedPills({ pills }: SelectedPillsProps) {
  if (pills.length === 0) {
    return (
      <Text size="sm" c="text-secondary">
        {t`Nothing selected`}
      </Text>
    );
  }
  const shown = pills.slice(0, COLLAPSED_PILL_LIMIT);
  const overflow = pills.length - shown.length;
  return (
    <Group align="center" gap="sm" wrap="wrap">
      {shown.map((pill, index) => (
        <PillItem
          key={`${pill.label}-${index}`}
          label={pill.label}
          interestingness={pill.interestingness}
        />
      ))}
      {overflow > 0 && <PillItem label={`+${overflow}`} isOverflow />}
    </Group>
  );
}

interface SelectedTimelinePillsProps {
  timelines: Timeline[];
  onRemoveTimeline: (timeline: Timeline) => void;
  onShowMore: () => void;
}

/**
 * Picked timelines rendered inline beside the "Events" button: the first
 * (most-relevant) one as a removable blue pill, the rest collapsed into a
 * "+N" pill that opens the events picker.
 */
export function SelectedTimelinePills({
  timelines,
  onRemoveTimeline,
  onShowMore,
}: SelectedTimelinePillsProps) {
  if (timelines.length === 0) {
    return null;
  }
  const [primary, ...rest] = timelines;
  return (
    <>
      <UnstyledButton
        className={cx(S.togglePill, S.togglePillSelected)}
        onClick={() => onRemoveTimeline(primary)}
        aria-label={t`Remove ${primary.name}`}
      >
        <Ellipsified>{primary.name}</Ellipsified>
      </UnstyledButton>
      {rest.length > 0 && (
        <UnstyledButton
          className={S.togglePill}
          onClick={onShowMore}
          aria-label={t`Show more events`}
        >
          {`+${rest.length}`}
        </UnstyledButton>
      )}
    </>
  );
}

interface PillItemProps {
  label: string;
  isOverflow?: boolean;
  interestingness?: number | null;
  onRemove?: () => void;
}

function PillItem({
  label,
  isOverflow,
  interestingness,
  onRemove,
}: PillItemProps) {
  return (
    <Pill
      withRemoveButton={onRemove != null}
      onRemove={onRemove}
      bdrs="xl"
      bg={isOverflow ? "background-secondary" : "background-primary"}
      bd="1px solid border"
      fw={600}
      py="0.375rem"
      px="sm"
      maw="100%"
      classNames={{ root: S.pill, remove: S.pillRemove, label: S.pillLabel }}
      data-interestingness={interestingness || "null"}
      removeButtonProps={
        onRemove != null
          ? { mr: 0, "aria-hidden": false, "aria-label": t`Remove` }
          : undefined
      }
    >
      <Ellipsified>{label}</Ellipsified>
    </Pill>
  );
}

interface TogglePillProps {
  label: string;
  selected: boolean;
  interestingness?: number | null;
  onToggle: () => void;
}

export function TogglePill({
  label,
  selected,
  interestingness,
  onToggle,
}: TogglePillProps) {
  return (
    <UnstyledButton
      className={cx(S.togglePill, { [S.togglePillSelected]: selected })}
      onClick={onToggle}
      aria-pressed={selected}
      data-interestingness={interestingness || "null"}
    >
      {selected && <Icon name="check" size={10} aria-hidden />}
      <Ellipsified>{label}</Ellipsified>
    </UnstyledButton>
  );
}
