// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import type { ColorName } from "metabase/lib/colors/types";
import { color } from "metabase/ui/utils/colors";

export const PermissionsSelectOptionRoot = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const IconContainer = styled.div<{ color: ColorName }>`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  width: 20px;
  height: 20px;
  color: var(--mb-color-text-primary-inverse);
  background-color: ${(props) => color(props.color)};
  flex-shrink: 0;
`;

export const PermissionsSelectLabel = styled.div`
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  padding: 0 0.5rem;
`;
