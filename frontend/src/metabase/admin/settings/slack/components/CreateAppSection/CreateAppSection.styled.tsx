import styled from "styled-components";
import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/components/ExternalLink";

export const SectionMessage = styled.div`
  color: ${color("text-medium")};
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
`;

export const SectionLink = styled(ExternalLink)`
  font-weight: 700;
`;
