import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const SectionHeader = styled.div`
  display: flex;
  margin-bottom: 1rem;
`;

export const SectionTitle = styled.div`
  color: ${color("text-medium")};
  font-size: 0.83em;
  font-weight: 900;
  line-height: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const SectionCloseIcon = styled(Icon)`
  display: block;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const Section = styled.div`
  margin: 2.5rem 0;

  ${SectionCloseIcon} {
    visibility: collapse;
  }

  &:hover ${SectionCloseIcon} {
    visibility: visible;
  }
`;
