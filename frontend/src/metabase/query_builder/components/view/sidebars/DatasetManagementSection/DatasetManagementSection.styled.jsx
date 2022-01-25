import styled from "styled-components";
import DefaultButton from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const SectionContent = styled.div`
  margin-top: 1rem;
  position: relative;
  right: 8px;
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
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

export const MetadataIndicatorContainer = styled.div`
  display: flex;
  flex: 0.4;
`;
