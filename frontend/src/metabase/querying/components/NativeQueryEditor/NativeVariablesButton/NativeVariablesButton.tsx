import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

interface NativeVariablesButtonProps {
  className?: string;
  isShowingTemplateTagsEditor: boolean;
  onClick?: () => void;
}

export const NativeVariablesButton = ({
  className,
  isShowingTemplateTagsEditor,
  onClick,
}: NativeVariablesButtonProps) => (
  <Tooltip label={t`Variables`}>
    <ActionIcon
      variant="subtle"
      className={className}
      aria-label={t`Variables`}
      aria-pressed={isShowingTemplateTagsEditor}
      selected={isShowingTemplateTagsEditor}
      onClick={onClick}
    >
      <Icon name="variable" />
    </ActionIcon>
  </Tooltip>
);
