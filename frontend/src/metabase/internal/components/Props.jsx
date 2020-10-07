import React from "react";

const Props = ({ of }) => {
  const component = of;
  return (
    <table className="Table">
      <thead>
        <th>Name</th>
        <th>Type</th>
        <th>Default</th>
        <th>Description</th>
      </thead>
      <tbody>
        {Object.keys(component.propTypes).map(prop => (
          <tr>
            <td>{prop}</td>
            <td>TYPE GOES HERE</td>
            <td>
              {component.defaultProps &&
              component.defaultProps[prop] !== undefined
                ? JSON.stringify(component.defaultProps[prop])
                : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Props;
