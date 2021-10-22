import styled from "styled-components";

import Card from "metabase/components/Card";

export const FullscreenCard = styled(Card)`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  height: 100vh;
  padding: 1rem;
  z-index: 5;
  overflow: auto;
`;

export const FixedCard = styled(Card)`
  position: fixed;
  right: 0;
  bottom: 0;
  width: 350px;
  height: 500px;
  margin: 1rem;
  padding: 1rem;
  z-index: 5;
  overflow: auto;
`;
