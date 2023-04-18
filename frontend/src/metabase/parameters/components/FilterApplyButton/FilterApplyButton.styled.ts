import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button/Button";

export const ApplyButton = styled(Button)<{ isVisible: boolean }>`
  margin-left: auto;
  margin-top: ${space(1)};

  opacity: ${({ isVisible }) => (isVisible ? 1 : 0)};
  visibility: ${({ isVisible }) => (isVisible ? "visible" : "hidden")};

  &,
  &:hover {
    transition-property: opacity, visibility;
  }
`;
