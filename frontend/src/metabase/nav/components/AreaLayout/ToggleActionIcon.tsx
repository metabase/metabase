import { t } from "ttag";

import { ActionIcon, FixedSizeIcon, Tooltip } from "metabase/ui";
import { isMac } from "metabase/utils/browser";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

const getSidebarTooltipLabel = (isNavbarOpened: boolean) => {
  const message = isNavbarOpened ? t`Close sidebar` : t`Open sidebar`;
  const modKey = isMac() ? "⌘" : "Ctrl";
  return `${message} ([ ${t`or`} ${modKey} + .)`;
};

type ToggleActionIconProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

export function ToggleActionIcon({
  isNavbarOpened,
  onNavbarToggle,
}: ToggleActionIconProps) {
  const label = getSidebarTooltipLabel(isNavbarOpened);

  return (
    <Tooltip label={label} openDelay={TOOLTIP_OPEN_DELAY}>
      <ActionIcon
        aria-label={label}
        className={S.toggle}
        onClick={() => onNavbarToggle(!isNavbarOpened)}
      >
        <FixedSizeIcon
          name={isNavbarOpened ? "sidebar_closed" : "sidebar_open"}
          c="text-secondary"
        />
      </ActionIcon>
    </Tooltip>
  );
}
