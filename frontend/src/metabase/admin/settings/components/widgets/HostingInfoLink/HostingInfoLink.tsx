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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HostingInfoLink;
