import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { SidebarContainer } from "./Sidebar.styled";

const WIDTH = 384;

const propTypes = {
  closeIsDisabled: PropTypes.bool,
  children: PropTypes.node,
  onClose: PropTypes.func,
  onCancel: PropTypes.func,
  className: PropTypes.string,
};

export default function Sidebar({
  closeIsDisabled,
  children,
  onClose,
  onCancel,
  className,
}) {
  return (
    <SidebarContainer width={WIDTH} className={className}>
      <div className="flex flex-column flex-auto overflow-y-auto">
        {children}
      </div>
      {(onClose || onCancel) && (
        <div
          className="flex align-center border-top"
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            paddingRight: 32,
            paddingLeft: 32,
          }}
        >
          {onCancel && (
            <Button small borderless onClick={onCancel}>{t`Cancel`}</Button>
          )}
          {onClose && (
            <Button
              primary
              small
              className="ml-auto"
              onClick={onClose}
              disabled={closeIsDisabled}
            >{t`Done`}</Button>
          )}
        </div>
      )}
    </SidebarContainer>
  );
}

Sidebar.propTypes = propTypes;
