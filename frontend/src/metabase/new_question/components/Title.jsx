import cxs from "cxs";
import React from "react";

const titleClasses = cxs({
    color: "#2E353B",
    fontSize: "25.63px",
    fontWeight: 900
});

const Title = ({ children }) => <h1 className={titleClasses}>{children}</h1>;

export default Title;
