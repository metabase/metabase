import React from "react";
import { HostingLink } from "./HostingInfoLink.styled";

export interface HostingInfoLinkProps {
  text: string;
}

const HostingInfoLink = ({ text }: HostingInfoLinkProps): JSX.Element => (
  <HostingLink
    href="https://www.metabase.com/migrate/from/selfhosted?utm_source=admin-panel&utm_medium=in-app"
    target="_blank"
  >
    {text}
  </HostingLink>
);

export default HostingInfoLink;
