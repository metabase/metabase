import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Button } from "metabase/core/components/Button";

const WIDTH = 384;

const propTypes = {
  closeIsDisabled: PropTypes.bool,
  children: PropTypes.node,
  onClose: PropTypes.func,
  onCancel: PropTypes.func,
};

function Sidebar({ closeIsDisabled, children, onClose, onCancel }) {
  return (
    <aside
      style={{ width: WIDTH, minWidth: WIDTH }}
      className="flex flex-column border-left bg-white"
    >
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
    </aside>
  );
}

Sidebar.propTypes = propTypes;

export default Sidebar;
