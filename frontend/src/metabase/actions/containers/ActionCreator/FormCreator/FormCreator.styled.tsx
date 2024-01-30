import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FormContainer = styled.div`
  display: flex;
  gap: ${space(2)};
  padding: 0 1.5rem 1rem;
  transition: flex 500ms ease-in-out;
  background-color: ${color("white")};
  flex-direction: column;
`;

export const FormFieldEditorDragContainer = styled.div`
  margin-bottom: ${space(1)};
`;

export const FieldSettingsButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;

export const WarningBanner = styled.div`
  padding: ${space(2)};
  border: 1px solid ${color("warning")};
  border-radius: ${space(1)};
  background: ${alpha("warning", 0.1)};
  line-height: 1.25rem;
`;
