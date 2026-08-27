import cx from "classnames";
import { t } from "ttag";

import { Box, Icon, Tooltip } from "metabase/ui";

import NativeVariablesButtonS from "./NativeVariablesButton.module.css";

interface NativeVariablesButtonProps {
  className?: string;
  isShowingTemplateTagsEditor: boolean;
  onClick?: () => void;
  size: number;
}

export const NativeVariablesButton = ({
  className,
  isShowingTemplateTagsEditor,
  onClick,
  size,
}: NativeVariablesButtonProps) => {
  return (
    <Tooltip label={t`Variables`}>
      <Box
        component="a"
        aria-label={t`Variables`}
        h={size}
        className={cx(className, NativeVariablesButtonS.ButtonRoot, {
          [NativeVariablesButtonS.isSelected]: isShowingTemplateTagsEditor,
        })}
      >
        <Icon name="variable" size={size} onClick={onClick} />
      </Box>
    </Tooltip>
  );
};
