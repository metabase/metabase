import styled from "styled-components";

type ContainerProps = {
  open: boolean;
};

export const Container = styled.div<ContainerProps>`
  display: relative;
  visibility: ${({ open }) => open && "visible"} !important;
`;
