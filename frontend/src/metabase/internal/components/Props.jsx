import React from "react";

const Props = ({ of }) => {
  const component = of;
  return (
    <div>
      <div className="">
        {Object.keys(component.propTypes).map(prop => (
          <div>
            {prop}{" "}
            {component.defaultProps &&
            component.defaultProps[prop] !== undefined
              ? "(default: " +
                JSON.stringify(component.defaultProps[prop]) +
                ")"
              : ""}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Props;
