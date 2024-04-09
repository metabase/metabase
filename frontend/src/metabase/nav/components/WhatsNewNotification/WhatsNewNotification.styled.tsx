import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DismissIconButtonWrapper = styled(IconButtonWrapper)`
  color: ${({ theme }) => theme.fn.themeColor("bg-dark")};

  &:hover {
    color: ${({ theme }) => theme.fn.themeColor("text-medium")};
  }
`;
