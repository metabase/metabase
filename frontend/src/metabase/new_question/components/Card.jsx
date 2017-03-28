import cxs from "cxs";
import colorUtil from "color";
import React from "react";

import { normal } from "metabase/lib/colors";

const Card = ({ color, name, children }) => (
    <div
        className={cxs({
            borderRadius: 4,
            backgroundColor: color,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 150,
            ":hover": {
                cursor: "pointer",
                backgroundColor: colorUtil(color).darken(0.2).string(),
                transition: "background 0.3s ease-out"
            }
        })}
    >
        {children ? children : <h3>{name}</h3>}
    </div>
);

Card.defaultProps = {
    color: normal.blue
};

export default Card;
