import React from "react";

const CollectionActions = ({ children }) => (
  <div
    className="flex align-center"
    onClick={e => {
      e.stopPropagation();
      e.preventDefault();
    }}
  >
    {React.Children.map(children, (child, index) => (
      <div key={index} className="cursor-pointer text-brand-hover mx1">
        {child}
      </div>
    ))}
  </div>
);

export default CollectionActions;
