import styled from "@emotion/styled";

export const NoRowsErrorIllustration = styled.div<{
  backgroundImageSrc: string;
}>`
  width: 120px;
  height: 120px;
  background-image: ${({ backgroundImageSrc }) => `url(${backgroundImageSrc})`};
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  margin-bottom: 1rem;
`;
