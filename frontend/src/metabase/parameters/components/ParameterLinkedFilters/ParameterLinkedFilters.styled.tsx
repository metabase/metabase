import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  padding: 1.5rem 1rem;
`;

export const SectionHeader = styled.div`
  font-size: 1rem;
  font-weight: bold;
`;

export const SectionMessage = styled.p`
  color: ${color("text-medium")};
`;

export const SectionMessageLink = styled.span`
  color: var(--mb-color-brand);
  cursor: pointer;
`;

export const ParameterRoot = styled.div`
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-light);
`;

export const ParameterBody = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
`;

export const ParameterName = styled.div`
  cursor: pointer;
  border-bottom: 1px dashed var(--mb-color-border);
  font-weight: bold;
`;

export const FieldListRoot = styled.div`
  font-size: 0.765rem;
`;

export const FieldListHeader = styled.div`
  display: flex;
  border-top: 1px solid var(--mb-color-border);
`;

export const FieldListTitle = styled.div`
  color: var(--mb-color-brand);
  width: 50%;
  padding: 0.5rem 1rem 0;
`;

export const FieldListItem = styled.div`
  display: flex;

  &:not(:last-child) {
    border-bottom: 1px solid var(--mb-color-border);
  }
`;

export const FieldRoot = styled.div`
  width: 100%;
  padding: 0.5rem 1rem;
`;

export const FieldLabel = styled.div`
  color: ${color("text-medium")};
`;
