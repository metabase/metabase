import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const StyledButton = styled(Button)<{ isFullHeight?: boolean }>`
  height: ${({ isFullHeight }) => (isFullHeight ? "100%" : "auto")};
`;

StyledButton.defaultProps = {
  isFullHeight: true,
};
