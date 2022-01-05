import styled from "styled-components";
import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

export const SectionMessage = styled.div`
  color: ${color("text-medium")};
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
`;

export const SectionLink = styled(ExternalLink)`
  font-weight: 700;
`;

export const SectionButton = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
`;

export const SectionButtonText = styled.div`
  font-weight: 700;
`;

export const SectionButtonIcon = styled(Icon)`
  color: ${color("white")};
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;
`;
