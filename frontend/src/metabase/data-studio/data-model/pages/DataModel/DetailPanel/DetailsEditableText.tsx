import cx from "classnames";

import {
  EditableText,
  type EditableTextProps,
} from "metabase/common/components/EditableText";
import { Box, Icon } from "metabase/ui";

import S from "./DetailsEditableText.module.css";

/**
 * Click-to-edit value that fills a `DetailsRow` with `fillValue`: tinted on
 * hover, with a pencil to show it's editable unless it's disabled.
 */
export function DetailsEditableText({
  className,
  isDisabled,
  ...props
}: EditableTextProps) {
  return (
    <Box className={cx(S.cell, { [S.disabled]: isDisabled })}>
      <EditableText
        {...props}
        isDisabled={isDisabled}
        className={cx(S.editableText, className)}
      />
      {!isDisabled && <Icon name="pencil" size={14} className={S.editIcon} />}
    </Box>
  );
}
