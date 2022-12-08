import styled from "@emotion/styled";
import InputBase from "metabase/core/components/Input";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FormCreatorWrapper = styled.div`
  flex: 1 1 0;
  transition: flex 500ms ease-in-out;
  padding: ${space(3)};
  background-color: ${color("white")};
  overflow-y: auto;
`;

export const FormItemWrapper = styled.div`
  border: 1px solid ${color("border")};
  padding: ${space(2)};
  border-radius: ${space(1)};
  margin-bottom: ${space(1)};
  background-color: ${color("bg-white")};
`;

export const FieldSettingsButtons = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  padding: ${space(0)};
  display: flex;
  gap: ${space(1)};
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
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  text-align: center;
  padding: 5rem;
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

export const ExplainerText = styled.p`
  font-weight: 400;
  color: ${color("text-medium")};
  margin: ${space(2)} auto;
`;

export const ExampleButton = styled.button`
  font-weight: bold;
  cursor: pointer;
  margin: ${space(2)};
  color: ${color("brand")};
  :hover {
    color: ${lighten("brand", 0.1)};
  }
`;

export const IconContainer = styled.div`
  display: inline-block;
  padding: 1.25rem;
  position: relative;
  color: ${color("brand")};
`;

export const TopRightIcon = styled(Icon)`
  position: absolute;
  top: 0;
  right: 0;
`;
