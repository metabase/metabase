import styled from "@emotion/styled";
import Card from "metabase/components/Card";
import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";
import { alpha, color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const UndoList = styled.ul`
  position: fixed;
  left: 0;
  bottom: 0;
  margin: ${space(2)};
  z-index: 999;
`;

export const ToastCard = styled(Card)<{
  translateY: number;
  color?: string;
}>`
  padding: 10px ${space(2)};
  margin-top: ${space(1)};
  min-width: 310px;
  transform: ${props => `translateY(${props.translateY}px)`};
  ${props => (props.color ? `background-color: ${color(props.color)}` : "")}
`;

export const CardContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const CardContentSide = styled.div`
  display: flex;
  align-items: center;
`;

export const CardIcon = styled(Icon)`
  margin-right: ${space(1)};
`;

export const DefaultText = styled.span`
  font-weight: 700;
`;

export const UndoButton = styled(Link)`
  font-weight: bold;
  background-color: ${alpha(color("bg-white"), 0.1)};
  padding: 4px 12px;
  margin-left: ${space(1)};
  border-radius: 8px;

  :hover {
    background-color: ${alpha(color("bg-white"), 0.3)};
  }
`;

export const DismissIcon = styled(Icon)`
  margin-left: ${space(2)};
  color: ${color("bg-dark")};
  cursor: pointer;

  :hover {
    color: ${lighten(color("bg-dark"), 0.3)};
  }
`;
