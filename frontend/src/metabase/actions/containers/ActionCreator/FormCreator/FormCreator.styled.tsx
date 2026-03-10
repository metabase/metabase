// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";

export const FormContainer = styled.div`
  display: flex;
  gap: var(--mantine-spacing-md);
  padding: 0 1.5rem 1rem;
  transition: flex 500ms ease-in-out;
  background-color: var(--mb-color-background-primary);
  flex-direction: column;
`;

export const FormFieldEditorDragContainer = styled.div`
  margin-bottom: var(--mantine-spacing-sm);
`;

export const FieldSettingsButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-sm);
`;

export const WarningBanner = styled.div`
  padding: var(--mantine-spacing-md);
  border: 1px solid var(--mb-color-warning);
  border-radius: var(--mantine-spacing-sm);
  background: ${() => alpha("warning", 0.1)};
  line-height: 1.25rem;
`;
