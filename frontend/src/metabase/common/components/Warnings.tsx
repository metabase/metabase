import cx from "classnames";
import { useId } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

type WarningSeverity = "warning" | "error";

interface WarningsProps {
  warnings?: string[];
  severity?: WarningSeverity;
  className?: string;
  size?: number;
  onClick?: () => void;
}

export const Warnings = ({
  warnings,
  severity = "warning",
  className = "",
  size = 16,
  onClick,
}: WarningsProps) => {
  const descriptionId = useId();

  if (!warnings || warnings.length === 0) {
    return null;
  }
  const tooltip = (
    <ul className={cx(CS.px2, CS.pt2, CS.pb1)} style={{ maxWidth: 350 }}>
      {warnings.map((warning) => (
        <li className={CS.pb1} key={warning}>
          {warning}
        </li>
      ))}
    </ul>
  );
  const color = severity === "error" ? "feedback-negative" : undefined;

  if (!onClick) {
    return (
      <Tooltip label={tooltip}>
        <Icon className={className} c={color} name="warning" size={size} />
      </Tooltip>
    );
  }

  return (
    <Tooltip label={tooltip}>
      <UnstyledButton
        aria-describedby={descriptionId}
        aria-label={t`Warnings`}
        className={className}
        display="block"
        onClick={onClick}
      >
        <Icon c={color} display="block" name="warning" size={size} />
        <span hidden id={descriptionId}>
          {warnings.join(" ")}
        </span>
      </UnstyledButton>
    </Tooltip>
  );
};
