/* eslint-disable react/prop-types */
import React, { forwardRef } from "react";

import { getUrlTarget } from "metabase/lib/dom";

const ExternalLink = forwardRef(function ExternalLink(
  { href, target = getUrlTarget(href), className, children, ...props },
  ref,
) {
  return (
    <a
      ref={ref}
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
});

export default ExternalLink;
