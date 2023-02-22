import styled from "@emotion/styled";

export interface FooterProps {
  hasPadding?: boolean;
}

export const FooterRoot = styled.div<FooterProps>`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding: ${props => (props.hasPadding ? "2rem" : "0")} 2rem 2rem;
`;
