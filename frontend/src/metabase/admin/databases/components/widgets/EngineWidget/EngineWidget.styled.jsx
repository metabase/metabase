import styled from "styled-components";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color, lighten } from "metabase/lib/colors";

export const EngineListRoot = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
`;

export const EngineCardRoot = styled(IconButtonWrapper)`
  flex: 1 1 auto;
  flex-direction: column;
  height: 5.375rem;
  padding: 1rem;
  border: 1px solid ${color("bg-medium")};
  background-color: ${color("white")};

  &:hover {
    border-color: ${color("brand")};
    background-color: ${lighten("brand", 0.1)};
  }
`;

export const EngineCardTitle = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.5rem;
`;

export const EngineCardLogo = styled.img`
  display: block;
  width: 2rem;
  height: 2rem;
`;
