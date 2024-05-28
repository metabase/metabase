import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const HelpRoot = styled.div`
  padding-left: 1rem;
`;

export const HelpBody = styled.div`
  margin: 1rem 0;
`;

export const HelpLinks = styled.div`
  margin: 1rem 0;
  max-width: 29.25rem;
`;

export const InfoBlockRoot = styled.div`
  padding: 1rem;
`;

export const InfoBlockButton = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  margin: 1rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const HelpExternalLink = styled(ExternalLink)`
  display: flex;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  transition: border 0.3s linear;
  text-decoration: none;

  &:hover {
    border-color: ${color("brand")};
  }
`;
