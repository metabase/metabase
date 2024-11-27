import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/ui";

export const BannerCloseButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-light);
  margin-inline-start: auto;
`;

export const FixedSizeIcon = styled(Icon)<{ size?: number }>`
  min-width: ${({ size }) => size ?? 16}px;
  min-height: ${({ size }) => size ?? 16}px;
`;

export const BannerModelIcon = styled(FixedSizeIcon)`
  color: var(--mb-color-text-dark);
  margin-inline-end: 0.5rem;
`;
