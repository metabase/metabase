import styled from "@emotion/styled";

import DefaultButton from "metabase/core/components/Button";

export const SectionTitle = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: var(--mb-color-text-medium);
`;

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
  color: var(--mb-color-brand);
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
