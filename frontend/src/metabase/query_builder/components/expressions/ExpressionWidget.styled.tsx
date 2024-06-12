import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const Container = styled.div`
  width: 472px;
`;

export const FieldWrapper = styled.div`
  padding: 0 1.5rem 1.5rem;
`;

export const ExpressionFieldWrapper = styled.div`
  padding: 1.5rem 1.5rem 1rem;
`;

export const FieldLabel = styled.label`
  display: flex;
  margin-bottom: 0.5rem;

  font-weight: 700;
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.06em;

  color: var(--mb-color-text-light);
`;

export const Footer = styled.div`
  padding: 0.5rem 1.5rem 1.5rem;

  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

export const RemoveLink = styled(Button)`
  padding-right: 1rem;
`;

export const ActionButtonsWrapper = styled.div`
  margin-left: auto;

  display: flex;
  gap: 1rem;
`;
