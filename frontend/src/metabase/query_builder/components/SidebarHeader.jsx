import React from "react";
import cx from "classnames";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

export default function SidebarHeader({
  className,
  title,
  icon,
  onBack,
  onClose,
}) {
  const backDefault = !title && !!onBack;
  if (backDefault) {
    title = t`Back`;
  }
  return (
    <div className={cx("flex align-center", className)}>
      <span
        className={cx("flex align-center text-heavy h3", {
          "cursor-pointer text-brand-hover": onBack,
          "h5 text-medium text-uppercase": backDefault,
        })}
        onClick={onBack}
      >
        {(onBack || icon) && (
          <Icon name={icon || "chevronleft"} className="mr1" />
        )}
        {title}
      </span>
      {onClose && (
        <a
          className="flex-align-right text-medium text-brand-hover no-decoration"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </a>
      )}
    </div>
  );
}
