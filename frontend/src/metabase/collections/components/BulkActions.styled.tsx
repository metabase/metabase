import styled from "@emotion/styled";
import Card from "metabase/components/Card";
import Button from "metabase/core/components/Button";
import { alpha, color } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { space } from "metabase/styled-components/theme";

export const BulkActionsToast = styled.div<{
  isNavbarOpen: boolean;
  translateY: number;
}>`
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: ${props => `translate(-50%, ${props.translateY}px)`};
  margin-left: ${props =>
    props.isNavbarOpen ? `${parseInt(NAV_SIDEBAR_WIDTH) / 2}px` : "0"};
  margin-bottom: ${space(2)};
  z-index: 999;
`;

export const ToastCard = styled(Card)`
  padding: 0.75rem ${space(2)};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.5rem;
`;

export const CardSide = styled.div`
  display: flex;
  align-items: center;
  gap: ${space(2)};
`;

export const CardButton = styled(Button)`
  border-color: ${alpha(color("bg-white"), 0)};
  background-color: ${alpha(color("bg-white"), 0.1)};
  :hover {
    border-color: ${alpha(color("bg-white"), 0)};
    background-color: ${alpha(color("bg-white"), 0.3)};
  }
`;
