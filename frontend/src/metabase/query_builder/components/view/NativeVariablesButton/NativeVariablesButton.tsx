import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import { ButtonRoot } from "./NativeVariablesButton.styled";

interface NativeVariablesButtonProps {
  className?: string;
  isShowingTemplateTagsEditor: boolean;
  size: number;
  toggleTemplateTagsEditor: () => void;
}

export const NativeVariablesButton = ({
  className,
  isShowingTemplateTagsEditor,
  size,
  toggleTemplateTagsEditor,
}: NativeVariablesButtonProps) => (
  <Tooltip tooltip={t`Variables`}>
    <ButtonRoot className={className} isSelected={isShowingTemplateTagsEditor}>
      <Icon name="variable" size={size} onClick={toggleTemplateTagsEditor} />
    </ButtonRoot>
  </Tooltip>
);
