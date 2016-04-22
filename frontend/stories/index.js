
// import all modules in this directory (http://stackoverflow.com/a/31770875)
var req = require.context("./", true, /^(.*\.(js$))[^.]*$/igm);
req.keys().forEach(function(key){
    req(key);
});

import React from "react";

// helper to center a component within the viewport
export const Centered = ({ children }) =>
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
    </div>

// re-export commonly used APIs for convienence, e.x.
//
//     import { React, Centered, storiesOf, action } from ".";
//
export { storiesOf, action, linkTo } from "@kadira/storybook";
export React from "react";
