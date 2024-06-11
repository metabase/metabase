import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const SectionRoot = styled.div`
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--mb-color-border);
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
`;

export const SectionContainer = styled.div`
  flex: 1 1 auto;
  margin-right: 2rem;
`;

export const SectionTitle = styled.div`
  color: var(--mb-color-text-dark);
  font-weight: 700;
`;

export const SectionDescription = styled.div`
  color: var(--mb-color-text-medium);
  margin-top: 0.5rem;
`;

export const SectionButton = styled(Button)`
  color: var(--mb-color-brand);
  width: 2.5rem;
  height: 2.5rem;
`;
