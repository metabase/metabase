import styled from "@emotion/styled";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { NotebookCell } from "./NotebookCell";

const FieldPickerContentContainer = styled(IconButtonWrapper)`
  color: ${color("white")};
  padding: ${NotebookCell.CONTAINER_PADDING};
  opacity: 0.5;
`;

interface FieldsPickerIconProps {
  isTriggeredComponentOpen?: boolean;
}

export function FieldsPickerIcon({
  isTriggeredComponentOpen,
}: FieldsPickerIconProps) {
  return (
    <Tooltip tooltip={t`Pick columns`} isEnabled={!isTriggeredComponentOpen}>
      <FieldPickerContentContainer
        aria-label={t`Pick columns`}
        data-testid="fields-picker"
      >
        <Icon name="chevrondown" />
      </FieldPickerContentContainer>
    </Tooltip>
  );
}

export const FIELDS_PICKER_STYLES = {
  notebookItemContainer: {
    padding: 0,
  },
  notebookRightItemContainer: {
    width: 37,
    height: 37,
    padding: 0,
  },
  trigger: {
    marginTop: 1,
  },
};
