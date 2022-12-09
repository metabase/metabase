import styled from "@emotion/styled";
import InputBase from "metabase/core/components/Input";
import Button from "metabase/core/components/Button";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FormCreatorWrapper = styled.div`
  padding: ${space(3)};
  background-color: ${color("white")};
  overflow-y: auto;
`;

export const FormItemWrapper = styled.div`
  border: 1px solid ${color("border")};
  padding: ${space(2)};
  border-radius: ${space(1)};
  margin-bottom: ${space(1)};
`;

export const FormSettings = styled.div`
  display: flex;
  gap: ${space(2)};
  align-items: center;
  justify-content: space-between;
`;

export const FormItemName = styled.div`
  margin-bottom: ${space(2)};
  margin-left: ${space(1)};
  font-weight: bold;
  color: ${color("text-medium")};
`;

export const Input = styled(InputBase)`
  margin-right: ${space(1)};
`;

export const EmptyFormPlaceholderWrapper = styled.div`
  text-align: center;
  max-width: 20rem;
  margin: 5rem auto;
`;

export const EditButton = styled(Button)`
  color: ${color("brand")};
  background-opacity: 0;
  &:hover {
    color: ${color("accent0-light")};
  }
`;

export const FormSettingsPreviewContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(1)};
  min-width: 12rem;
`;
