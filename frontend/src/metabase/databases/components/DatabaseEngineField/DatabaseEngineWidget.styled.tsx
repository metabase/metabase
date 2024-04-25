import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color, lighten } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const EngineSearchRoot = styled.div`
  display: block;
  margin-bottom: 1.25rem;
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
  outline: ${props => (props.isActive ? `2px solid ${color("focus")}` : "")};

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

export const EngineButtonRoot = styled(Button)`
  margin-bottom: 1.25rem;
  padding: 0.8125rem 0.75rem;

  ${Button.Content} {
    justify-content: space-between;
  }
`;

export const EngineToggleRoot = styled(Button)`
  width: 100%;
`;
