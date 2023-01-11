import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const ActionFormButtonContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;

interface FormFieldContainerProps {
  isSettings?: boolean;
}

export const FormFieldContainer = styled.div<FormFieldContainerProps>`
  ${({ isSettings }) =>
    isSettings &&
    `
    position: relative;
    display: flex;
    align-items: center;
    border-radius: ${space(1)};
    padding: ${space(1)};
    margin-bottom: ${space(1)};
    background-color: ${color("bg-white")};
    border: 1px solid ${color("border")};
    overflow: hidden;
  `}
`;

export const SettingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: ${color("text-medium")};
  margin-right: ${space(1)};
`;

export const InputContainer = styled.div`
  flex-grow: 1;
  flex-basis: 1;
  flex-shrink: 0;
`;
