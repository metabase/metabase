import styled from "styled-components";
import DefaultButton from "metabase/components/Button";
import { color } from "metabase/lib/colors";

export const SectionTitle = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: ${color("text-medium")};
`;

export const SectionContent = styled.div`
  margin-top: 1rem;
  position: relative;
  right: 8px;
`;

export const Button = styled(DefaultButton)`
  padding: 8px;
  color: ${color("brand")};
  font-weight: 700;
  border: none;
`;

Button.defaultProps = {
  iconSize: 16,
};
