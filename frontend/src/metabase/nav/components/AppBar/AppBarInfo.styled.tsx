import styled from "@emotion/styled";

export interface InfoBarRootProps {
  isNavBarOpen?: boolean;
}

export const InfoBarRoot = styled.div<InfoBarRootProps>`
  display: flex;
  visibility: ${props => (props.isNavBarOpen ? "hidden" : "visible")};
  opacity: ${props => (props.isNavBarOpen ? 0 : 1)};
  transition: ${props =>
    props.isNavBarOpen ? `opacity 0.5s, visibility 0s` : `opacity 0.5s`};
`;
