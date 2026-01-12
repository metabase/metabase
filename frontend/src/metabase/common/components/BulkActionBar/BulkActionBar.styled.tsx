// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Card from "metabase/common/components/Card";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

export const BulkActionsToast = styled.div<{ isNavbarOpen: boolean }>`
  position: fixed;
  bottom: 0;
  left: 50%;
  margin-left: ${(props) =>
    props.isNavbarOpen ? `${parseInt(NAV_SIDEBAR_WIDTH) / 2}px` : "0"};
  margin-bottom: var(--mantine-spacing-md);
  transform: translateX(-50%);
`;

export const ToastCard = styled(Card)`
  color: var(--mb-color-text-primary-inverse);
  padding: 0.75rem var(--mantine-spacing-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.5rem;
`;
