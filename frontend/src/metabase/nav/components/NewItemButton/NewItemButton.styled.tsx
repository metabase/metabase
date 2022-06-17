import styled from "@emotion/styled";
import Button from "metabase/core/components/Button/Button";
import { breakpointMaxSmall } from "metabase/styled-components/theme";
import NewItemMenu from "../../containers/NewItemMenu";

export const NewMenu = styled(NewItemMenu)`
  margin-right: 0.5rem;

  ${breakpointMaxSmall} {
    display: none;
  }
`;

export const NewButton = styled(Button)`
  display: flex;
  align-items: center;
  height: 2.25rem;
  margin-right: 0.5rem;
  padding: 0.5rem;

  ${Button.TextContainer} {
    margin-left: 0;
  }

  ${breakpointMaxSmall} {
    display: none;
  }
`;

export const NewButtonText = styled.h4`
  display: inline;
  margin-left: 0.5rem;
  white-space: nowrap;
`;
