import styled from "@emotion/styled";

type ContainerProps = {
  open: boolean;
};

export const Container = styled.div<ContainerProps>`
  display: relative;
  visibility: ${({ open }) => open && "visible"} !important;
`;
