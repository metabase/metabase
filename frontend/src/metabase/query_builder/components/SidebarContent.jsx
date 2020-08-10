import React from "react";

import ViewButton from "./view/ViewButton";
import SidebarHeader from "./SidebarHeader";

import cx from "classnames";
import { t } from "ttag";

export default function SidebarContent({
  className,
  icon,
  title,
  color,
  onBack,
  onClose,
  onDone,
  doneButtonText = t`Done`,
  footer = onDone ? (
    <FooterButton color={color} onClick={onDone}>
      {doneButtonText}
    </FooterButton>
  ) : null,
  children,
}) {
  return (
    <div
      className={cx(className, "flex flex-column justify-between full-height")}
    >
      <div className="scroll-y">
        {(title || onBack || icon) && (
          <SidebarHeader
            className="mx3 my2 pt1"
            title={title}
            icon={icon}
            onBack={onBack}
            onClose={onClose}
          />
        )}
        {children}
      </div>
      {footer}
    </div>
  );
}

const FooterButton = props => (
  <ViewButton
    active
    px={4}
    ml="auto"
    mr="auto"
    mb={2}
    mt={1}
    className="circular shadowed"
    {...props}
  />
);
