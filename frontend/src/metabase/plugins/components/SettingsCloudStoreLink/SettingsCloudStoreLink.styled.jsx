import styled from "styled-components";
import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

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
