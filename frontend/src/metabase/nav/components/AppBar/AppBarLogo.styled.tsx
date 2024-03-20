import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

export const LogoLink = styled(Link)<{ isSmallAppBar: boolean }>`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  height: 3.25rem;
  min-width: 2.25rem;
  max-width: 12rem;
  overflow-x: hidden;
  line-height: 0;
  opacity: 1;
  ${props =>
    !props.isSmallAppBar &&
    css`
      margin-right: 2rem;
    `}
`;
