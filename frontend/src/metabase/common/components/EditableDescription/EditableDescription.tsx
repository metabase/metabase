import { t } from "ttag";

import {
  EditableText,
  type EditableTextProps,
} from "metabase/common/components/EditableText";
import { Box, type BoxProps } from "metabase/ui";

export interface EditableDescriptionProps
  extends BoxProps, Omit<EditableTextProps, "style"> {
  description: string | null;
  canWrite: boolean;
  onChange: (newDescription: string) => void;
}

export const EditableDescription = ({
  description,
  canWrite,
  onChange,
  ...props
}: EditableDescriptionProps) => {
  return (
    <Box
      component={EditableText}
      onChange={onChange}
      initialValue={description}
      placeholder={
        !description && !canWrite ? t`No description` : t`Add description`
      }
      isDisabled={!canWrite}
      isOptional
      isMultiline
      isMarkdown
      lh={1.57}
      {...props}
    />
  );
};
