import React from "react";

const ExternalLink = ({ href, children }) =>
    <a
        href={href}
        className="link"
        // open in a new tab
        target="_blank"
        // prevent malicious pages from navigating us away
        rel="noopener"
        // disables quickfilter in tables
        onClickCapture={(e) => e.stopPropagation()}
    >
        {children}
    </a>

export default ExternalLink;
