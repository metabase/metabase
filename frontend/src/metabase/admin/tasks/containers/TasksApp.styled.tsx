import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const SectionRoot = styled.div`
  padding-left: 1rem;
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
`;

export const SectionTitle = styled.div`
  display: flex;
  align-items: center;
`;

export const SectionControls = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;
`;

export const InfoIcon = styled(Icon)`
  margin-top: 0.3125rem;
  margin-left: 0.5rem;
  cursor: pointer;
  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
