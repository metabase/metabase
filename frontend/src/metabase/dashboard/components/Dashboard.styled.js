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

  ${props =>
    !props.isEditing &&
    css`
      position: sticky;
      top: 0;
      z-index: 3;
    `}
`;
