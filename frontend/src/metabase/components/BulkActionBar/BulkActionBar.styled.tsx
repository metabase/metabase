import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { alpha, color } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { space } from "metabase/styled-components/theme";
import { Button } from "metabase/ui";

export const BulkActionsToast = styled.div<{ isNavbarOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: 50%;
  margin-left: ${props =>
    props.isNavbarOpen ? `${parseInt(NAV_SIDEBAR_WIDTH) / 2}px` : "0"};
  margin-bottom: ${space(2)};
  transform: translateX(-50%);
`;

export const ToastCard = styled(Card)`
  color: var(--mb-color-text-white);
  padding: 0.75rem ${space(2)};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.5rem;
`;

export const BulkActionButton = styled(Button)`
  color: var(--mb-color-text-white);
  border-color: ${() => alpha(color("bg-white"), 0)};
  background-color: ${() => alpha(color("bg-white"), 0.1)};

  :hover {
    color: var(--mb-color-text-white);
    border-color: ${() => alpha(color("bg-white"), 0)};
    background-color: ${() => alpha(color("bg-white"), 0.3)};
  }

  :disabled {
    border-color: ${() => alpha(color("bg-white"), 0)};
    background-color: ${() => alpha(color("bg-white"), 0.1)};
  }
` as unknown as typeof Button;

export const BulkActionDangerButton = styled(BulkActionButton)`
  :hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-error);
  }
` as unknown as typeof Button;
