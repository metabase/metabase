import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { alpha, color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Button, DEFAULT_POPOVER_Z_INDEX } from "metabase/ui";

// needed to put this over popovers (z-index: 300)
export const BULK_ACTIONS_Z_INDEX = DEFAULT_POPOVER_Z_INDEX + 1;

export const BulkActionsToast = styled.div<{ isNavbarOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: 50%;
  margin-bottom: ${space(2)};
  z-index: ${BULK_ACTIONS_Z_INDEX};
`;

export const ToastCard = styled(Card)`
  color: ${color("white")};

  padding: 0.75rem ${space(2)};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.5rem;
`;

export const BulkActionButton = styled(Button)`
  color: ${color("white")};

  border-color: ${alpha(color("bg-white"), 0)};
  background-color: ${alpha(color("bg-white"), 0.1)};
  :hover {
    color: ${color("white")};
    border-color: ${alpha(color("bg-white"), 0)};
    background-color: ${alpha(color("bg-white"), 0.3)};
  }
` as unknown as typeof Button;
