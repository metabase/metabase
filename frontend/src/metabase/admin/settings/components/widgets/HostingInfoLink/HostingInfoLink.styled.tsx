import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { ExternalLink } from "metabase/core/components/ExternalLink";

export const HostingLink = styled(ExternalLink)`
  font-weight: bold;
  white-space: nowrap;
  padding: 0.5rem 1rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
