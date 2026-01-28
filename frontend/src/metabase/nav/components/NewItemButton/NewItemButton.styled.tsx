// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  Button,
  type ButtonProps,
} from "metabase/common/components/Button/Button";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const NewButton = styled((props: ButtonProps) => (
  <Button {...props} iconSize={props.iconSize ?? 16} />
))`
  display: flex;
  align-items: center;
  height: 2.25rem;
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
