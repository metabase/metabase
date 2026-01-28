import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Triggerable } from "metabase/common/components/Triggerable";
import { Group, Icon } from "metabase/ui";

export const GrabberHandle = styled(Icon, { shouldForwardProp: isPropValid })`
  color: var(--mb-color-text-secondary);
  cursor: grab;
`;

export const ChartSettingFieldPickerRoot = styled(Group, {
  shouldForwardProp: isPropValid,
})`
  border: 1px solid var(--mb-color-border);
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
  ${Triggerable.Trigger} {
    flex: 1;
    overflow: hidden;
  }

  &:hover {
    ${GrabberHandle} {
      color: var(--mb-color-brand);
    }
  }
`;
