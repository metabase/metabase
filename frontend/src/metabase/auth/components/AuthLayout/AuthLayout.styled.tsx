import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const LayoutRoot = styled.div`
  position: relative;
  min-height: 100vh;
`;

export const LayoutBody = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 0 1rem 2rem;
  min-height: 100%;
`;

export const LayoutCard = styled.div`
  width: 30.875rem;
  margin-top: 1.5rem;
  padding: 2.5rem 3.5rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 15px ${color("shadow")};
  border-radius: 6px;
`;

export const LayoutScene = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

export const LayoutSceneImage = styled.img`
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
