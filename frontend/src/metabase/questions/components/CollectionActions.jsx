import React from "react";

const CollectionActions = ({ children }) =>
    <div onClick={(e) => { e.stopPropagation(); e.preventDefault() }}>
        {React.Children.map(children, (child, index) =>
            <span key={index} className="cursor-pointer text-brand-hover mx1">
                {child}
            </span>
        )}
    </div>

export default CollectionActions;
