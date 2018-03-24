import React from "react";
import cxs from "cxs";
import Tooltip from "metabase/components/Tooltip";

const termStyles = cxs({
  textDecoration: "none",
  borderBottom: "1px dotted #DCE1E4",
});
export const TermWithDefinition = ({ children, definition, link }) => (
  <Tooltip tooltip={definition}>
    {link ? (
      <a href={link} className={termStyles} target="_blank">
        {children}
      </a>
    ) : (
      <span className={termStyles}>{children}</span>
    )}
  </Tooltip>
);
