import styled from "styled-components";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const EngineListRoot = styled.div`
  display: flex;
`;

export const EngineCardRoot = styled(IconButtonWrapper)`
  flex: 1 1 auto;
  height: 5.375rem;
  padding: 1rem;
`;

export const EngineCardTitle = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.5rem;
`;

export const EngineCardIcon = styled.img`
  display: block;
  width: 2rem;
  height: 2rem;
`;
