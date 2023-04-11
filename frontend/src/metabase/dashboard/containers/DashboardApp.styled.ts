import styled from "@emotion/styled";
import Button from "metabase/core/components/Button/Button";

export const ApplyButton = styled(Button)<{ isVisible: boolean }>`
  margin-left: auto;

  opacity: ${({ isVisible }) => (isVisible ? 1 : 0)};
  visibility: ${({ isVisible }) => (isVisible ? "visible" : "hidden")};
`;
