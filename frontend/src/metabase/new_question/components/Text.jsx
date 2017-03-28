import cxs from "cxs";
import React from "react";

const Text = ({ children }) => (
    <p
        className={cxs({
            fontSize: "16px",
            color: "#93A1AB",
            lineHeight: "22px",
            margin: 0
        })}
    >
        {children}
    </p>
);

export default Text;
