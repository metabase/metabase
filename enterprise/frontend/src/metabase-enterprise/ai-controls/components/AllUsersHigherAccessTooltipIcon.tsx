import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import S from "./AllUsersHigherAccessTooltipIcon.module.css";

type AllUsersHigherAccessTooltipIconProps = {
  groupName: string;
  variant: "tool-permission" | "group-limits";
};

export function AllUsersHigherAccessTooltipIcon({
  groupName,
  variant,
}: AllUsersHigherAccessTooltipIconProps) {
  let tooltipLabel =
    t`The "${groupName}" group has this feature enabled, which will override this setting. ` +
    t`To restrict access, limit or disable it for the "${groupName}" group first.`;

  if (variant === "group-limits") {
    tooltipLabel =
      t`The "${groupName}" group limit is higher or unlimited, which will override this setting. ` +
      t`To restrict usage, lower or set a limit for the "${groupName}" group first.`;
  }

  return (
    <Tooltip label={tooltipLabel}>
      <Icon
        aria-label={t`Group limit warning`}
        className={S.InfoIcon}
        name="info"
        size={16}
      />
    </Tooltip>
  );
}
