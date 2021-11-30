import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const LandingSectionHeader = styled.div`
  display: flex;
  margin-bottom: 1rem;
`;

export const LandingSectionTitle = styled.div`
  color: ${color("text-medium")};
  font-size: 0.83em;
  font-weight: 900;
  line-height: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const LandingSectionIcon = styled(Icon)`
  display: block;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const LandingSection = styled.div`
  margin-top: 2.5rem;

  ${LandingSectionIcon} {
    visibility: collapse;
  }

  &:hover ${LandingSectionIcon} {
    visibility: visible;
  }
`;
