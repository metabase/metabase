import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const EngineSearchRoot = styled.div`
  display: block;
`;

export const EngineListRoot = styled.ul`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 1.5rem 0;

  ${breakpointMinSmall} {
    grid-template-columns: repeat(3, 1fr);
  }
`;

export interface EngineCardRootProps {
  isActive: boolean;
}

export const EngineCardRoot = styled.li<EngineCardRootProps>`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 5.375rem;
  padding: 1rem;
  border: 1px solid ${color("bg-medium")};
  border-radius: 0.375rem;
  background-color: ${color("white")};
  cursor: pointer;
  outline: ${props =>
    props.isActive ? `2px solid ${color("brand-light")}` : ""};

  &:hover {
    border-color: ${color("brand")};
    background-color: ${lighten("brand", 0.6)};
  }
`;

export const EngineCardTitle = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.5rem;
`;

export const EngineCardIcon = styled(Icon)`
  color: ${color("text-medium")};
  width: 1rem;
  height: 1rem;
  padding: 0.5rem;
`;

export const EngineCardImage = styled.img`
  width: 2rem;
  height: 2rem;
`;

export const EngineEmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 12.25rem;
  margin: 1.5rem 0;
`;

export const EngineEmptyIcon = styled(Icon)`
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
`;

export const EngineEmptyText = styled.div`
  color: ${color("text-light")};
  font-weight: bold;
  line-height: 1.5rem;
  max-width: 26rem;
  text-align: center;
`;

export const EngineExpandButton = styled(Button)`
  width: 100%;
`;

export const EngineButtonRoot = styled.button`
  display: flex;
  align-items: center;
  color: ${color("white")};
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid ${color("brand")};
  background-color: ${color("brand")};
  transition: all 200ms linear;
  transition-property: color, background-color;

  &:hover {
    color: ${color("white")};
    background-color: ${lighten("brand", 0.12)};
  }

  &:focus {
    outline: 2px solid ${color("brand-light")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;

export const EngineButtonTitle = styled.div`
  flex: 1 0 auto;
  font-size: 1rem;
  font-weight: bold;
`;

export const EngineButtonIcon = styled(Icon)`
  cursor: pointer;
`;
