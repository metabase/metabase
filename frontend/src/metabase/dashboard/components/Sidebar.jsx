import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { useDataAppContext } from "metabase/data-apps/containers/DataAppContext";

const WIDTH = 384;

const propTypes = {
  isDataApp: PropTypes.bool,
  closeIsDisabled: PropTypes.bool,
  children: PropTypes.node,
  onClose: PropTypes.func,
  onCancel: PropTypes.func,
};

function Sidebar({ closeIsDisabled, children, onClose, onCancel }) {
  const { isDataApp } = useDataAppContext();

  return (
    <aside
      style={{
        width: WIDTH,
        minWidth: WIDTH,
        padding: isDataApp ? "20px 20px 20px 0" : 0,
      }}
      className={cx("flex flex-column", {
        "border-left bg-white": !isDataApp,
      })}
    >
      <div
        className={cx("flex flex-column flex-auto overflow-y-auto", {
          "bordered rounded bg-white": isDataApp,
        })}
      >
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
