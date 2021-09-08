import React, { Fragment } from "react";
import PropTypes from "prop-types";

const propTypes = {
  setting: PropTypes.object,
};

const SettingHeader = ({ setting }) => {
  const description = setting.description ?? "";

  return (
    <div>
      <div className="text-medium text-bold text-uppercase">
        {setting.display_name}
      </div>
      <div className="text-medium text-measure my1">
        {setting.warningMessage && (
          <Fragment>
            <strong>{setting.warningMessage}</strong>{" "}
          </Fragment>
        )}
        {description.split("<br>").map((text, index) => (
          <Fragment key={index}>
            {index > 0 && <br />}
            <span>{text}</span>
          </Fragment>
        ))}
        {setting.note && <div>{setting.note}</div>}
      </div>
    </div>
  );
};

SettingHeader.propTypes = propTypes;

export default SettingHeader;
