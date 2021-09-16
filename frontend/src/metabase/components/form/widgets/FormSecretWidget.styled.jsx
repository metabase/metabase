import styled, { css } from "styled-components";

import Select from "metabase/components/Select";

export const Container = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

export const StyledSelect = styled(Select)`
  height: 45px;
  width: 30%;
`;

export const Input = styled.input`
  width: calc(70% - 10px);

  ${({ isFullWidth }) =>
    isFullWidth &&
    css`
      width: 100%;
    `}
`;
