import React from "react";
import ExternalLink from "metabase/components/ExternalLink";

const HostingInfoLink = ({ text }) => (
  <ExternalLink
    className="bordered rounded border-brand bg-brand-hover text-white-hover px2 py1 text-bold text-center"
    href={"https://www.metabase.com/migrate/from/selfhosted"}
    target="_blank"
  >
    {text}
  </ExternalLink>
);

export default HostingInfoLink;
