import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import S from "./AllUsersHigherAccessTooltipIcon.module.css";

type AllUsersHigherAccessTooltipIconProps = {
  groupName: string;
};

export function AllUsersHigherAccessTooltipIcon({
  groupName,
}: AllUsersHigherAccessTooltipIconProps) {
  const tooltipLabel =
    t`The "${groupName}" group limit is higher or unlimited, which will override this setting. ` +
    t`To restrict usage, lower or set a limit for the "${groupName}" group first.`;

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
