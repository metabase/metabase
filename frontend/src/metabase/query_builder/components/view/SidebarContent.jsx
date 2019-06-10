import React from "react";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import cx from "classnames";
import { t } from "ttag";

const SidebarContent = ({
  className,
  icon,
  title,
  onBack,
  onClose,
  footer = onClose ? (
    <Button
      primary
      className="m2 circular shadowed text-centered ml-auto mr-auto"
      onClick={onClose}
    >
      {t`Done`}
    </Button>
  ) : null,
  children,
}) => {
  return (
    <div className={cx(className, "flex flex-column justify-between")}>
      <div className="scroll-y">
        <div
          className={cx("flex align-center px4 pt3 mb2", {
            "cursor-pointer text-brand-hover": onBack,
          })}
          onClick={onBack}
        >
          {onBack || icon ? (
            <Icon name={icon || "chevronleft"} className="mr1" />
          ) : null}
          <h3 className="text-heavy">{title}</h3>
        </div>
        {children}
      </div>
      {footer}
    </div>
  );
};

export default SidebarContent;
