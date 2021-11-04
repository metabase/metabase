import styled from "styled-components";
import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const UndoList = styled.ul`
  position: fixed;
  left: 0;
  bottom: 0;
  margin: ${space(2)};
  z-index: 999;
`;

export const ToastCard = styled(Card)`
  padding: ${space(2)};
  margin-top: ${space(1)};
`;

export const CardContent = styled.div`
  display: flex;
  align-items: center;
`;

export const CardIcon = styled(Icon)`
  margin-right: ${space(1)};
`;

export const UndoButton = styled(Link)`
  margin-left: ${space(1)};
  font-weight: bold;
  text-decoration: none;
  color: ${color("brand")};

  &:hover {
    text-decoration: underline;
  }
`;

export const DismissIcon = styled(Icon)`
  margin-left: ${space(1)};
  color: ${color("text-light")};
  cursor: pointer;

  :hover {
    color: ${color("text-medium")};
  }
`;
