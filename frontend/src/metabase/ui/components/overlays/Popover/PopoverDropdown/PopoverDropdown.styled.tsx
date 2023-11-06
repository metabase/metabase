import styled from "@emotion/styled";
import { rem } from "@mantine/core";

export const Dropdown = styled.div`
  position: absolute;
  background-color: ${({ theme }) => theme.white};
  border: ${rem(1)} solid ${({ theme }) => theme.colors.border[0]};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus {
    outline: 0;
  }
`;
