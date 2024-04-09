import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

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
