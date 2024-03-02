import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const Description = styled.p`
  color: ${color("text-dark")};
  max-width: 360px;
`;

export const Link = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  color: ${color("text-white")};
  font-weight: bold;
  background-color: ${color("brand")};
  padding: 12px 18px;
  border-radius: 6px;

  &:hover {
    opacity: 0.88;
    transition: all 200ms linear;
  }
`;

export const LinkIcon = styled(Icon)`
  color: ${color("text-white")};
  opacity: 0.6;
  margin-left: 8px;
`;
