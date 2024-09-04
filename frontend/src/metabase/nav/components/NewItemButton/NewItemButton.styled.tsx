import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const NewButton = styled(Button)`
  display: flex;
  align-items: center;
  height: 2.25rem;
  padding: 0.5rem;
  padding-left: 16px;
  background-color: #587330 !important;
  border: none !important;
  width: 100%;
  ${Button.TextContainer} {
    margin-left: 0;
  }

  ${breakpointMaxSmall} {
    display: none;
  }
`;

NewButton.defaultProps = {
  iconSize: 16,
};

export const NewButtonText = styled.h4`
  display: inline;
  margin-left: 0.5rem;
  white-space: nowrap;
  font-weight: normal;
`;
