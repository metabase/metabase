// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import type { ColorName } from "metabase/lib/colors/types";
import { color } from "metabase/ui/utils/colors";

interface PermissionIconContainerProps {
  color: ColorName;
}

export const PermissionIconContainer = styled.div<PermissionIconContainerProps>`
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  margin-right: 0.375rem;
  color: var(--mb-color-text-primary-inverse);
  background-color: ${(props) => color(props.color)};
`;
