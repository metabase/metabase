import React from "react";

import { getUrlTarget } from "metabase/lib/dom";

const ExternalLink = ({
  href,
  target = getUrlTarget(href),
  className,
  children,
  ...props
}) => (
  <a
    href={href}
    className={className || "link"}
    target={target}
    // prevent malicious pages from navigating us away
    rel="noopener noreferrer"
    // disables quickfilter in tables
    onClickCapture={e => e.stopPropagation()}
    {...props}
  >
    {children}
  </a>
);

export default ExternalLink;
