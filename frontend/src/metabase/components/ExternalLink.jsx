import React from "react";

const ExternalLink = ({ href, className, children, ...props }) => (
  <a
    href={href}
    className={className || "link"}
    // open in a new tab
    target="_blank"
    // prevent malicious pages from navigating us away
    rel="noopener"
    // disables quickfilter in tables
    onClickCapture={e => e.stopPropagation()}
    {...props}
  >
    {children}
  </a>
);

export default ExternalLink;
