import styled from "styled-components";

export const SceneRoot = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

export const SceneImage = styled.img`
  position: relative;
  left: -1240px;
  bottom: -3px;

  @media screen and (min-width: 800px) {
    left: -1040px;
  }

  @media screen and (min-width: 1200px) {
    left: -840px;
  }

  @media screen and (min-width: 1600px) {
    left: -640px;
  }

  @media screen and (min-width: 1920px) {
    left: 0;
    width: 100%;
  }
`;
