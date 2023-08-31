import styled from "@emotion/styled";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DismissIconButtonWrapper = styled(IconButtonWrapper)`
  color: ${({ theme }) => theme.colors.bg[2]};

  &:hover {
    color: ${({ theme }) => theme.colors.text[1]};
  }
`;
