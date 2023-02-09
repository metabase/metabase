import styled from "@emotion/styled";
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

export const FieldSettingsButtonsContainer = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  padding: ${space(0)};
  display: flex;
  gap: ${space(1)};
  align-items: center;
  justify-content: flex-end;
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
