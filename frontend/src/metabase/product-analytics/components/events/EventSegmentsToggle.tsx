import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import { useSegmentDrag } from "../../segments/drag-context";

/**
 * Shows and hides the event segments panel, to drag segments from onto the
 * event wells below. At the end of an event setting's title.
 */
export const EventSegmentsToggle = () => {
  const { isPaletteOpen, onTogglePalette } = useSegmentDrag();
  const label = isPaletteOpen ? t`Hide event segments` : t`Show event segments`;
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="subtle"
        aria-label={label}
        aria-pressed={isPaletteOpen}
        onClick={onTogglePalette}
      >
        <Icon name="segment" />
      </ActionIcon>
    </Tooltip>
  );
};
