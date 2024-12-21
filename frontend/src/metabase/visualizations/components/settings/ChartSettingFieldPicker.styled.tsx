import styled from "@emotion/styled";

import Triggerable from "metabase/components/Triggerable";
import { Group, type GroupProps, Icon } from "metabase/ui";

export const GrabberHandle = styled(Icon)`
  color: var(--mb-color-text-medium);
  cursor: inherit;
`;

interface ChartSettingFieldPickerRootProps extends GroupProps {
  showDragHandle: boolean;
}

export const ChartSettingFieldPickerRoot = styled(
  Group,
)<ChartSettingFieldPickerRootProps>`
  border: 1px solid var(--mb-color-border);
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: ${props => (props.showDragHandle ? "grab" : "default")};
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
