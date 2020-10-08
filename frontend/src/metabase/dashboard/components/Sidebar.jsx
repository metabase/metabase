import React from "react";
import { t } from "ttag";

import Button from "metabase/components/Button";

const WIDTH = 384;

function Sidebar({ onClose, onCancel, children }) {
  return (
    <div
      style={{ width: WIDTH }}
      className="flex flex-column border-left bg-white"
    >
      <div className="flex flex-column flex-auto overflow-y-scroll">
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
            >{t`Done`}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export default Sidebar;
