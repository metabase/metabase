/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

const Code = ({ children, block }) => {
  if (block) {
    return <div className="text-code">{children}</div>;
  } else if (typeof children === "string" && children.split(/\n/g).length > 1) {
    return (
      <span>
        {children.split(/\n/g).map((line, index) => [
          <span className="text-code" style={{ lineHeight: "1.8em" }}>
            {line}
          </span>,
          <br />,
        ])}
      </span>
    );
  } else {
    return <span className="text-code">{children}</span>;
  }
};

Code.propTypes = {
  children: PropTypes.any.isRequired,
  block: PropTypes.bool,
};

export default Code;
