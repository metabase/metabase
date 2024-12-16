import { t } from "ttag";

import EditableText, {
  type EditableTextProps,
} from "metabase/core/components/EditableText";
import { Box, type BoxProps } from "metabase/ui";

export interface EditableDescriptionProps extends BoxProps, EditableTextProps {
  description: string | null;
  canWrite: boolean;
  onChange: (newDescription: string) => void;
  key?: string | number;
}

export const EditableDescription = ({
  description,
  canWrite,
  onChange,
  key,
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
      key={key}
      lh={1.57}
      {...props}
    />
  );
};
