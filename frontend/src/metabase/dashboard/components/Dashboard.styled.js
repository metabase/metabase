import styled, { css } from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

export const ParametersWidgetContainer = styled(FullWidthContainer)`
  align-items: flex-start;
  background-color: ${color("bg-light")};
  display: flex;
  flex-direction: column;
  padding-top: ${space(2)};
  padding-bottom: ${space(1)};

  ${({ isEditing }) =>
    !isEditing &&
    css`
      position: sticky;
      top: 0;
      z-index: 3;
    `}
`;

export const TilesContainer = styled(FullWidthContainer)`
  width: ${({ isEditingParameter }) =>
    isEditingParameter ? "calc(100vw - 390px)" : "100vw"};
`;
