import cx from "classnames";
import { t } from "ttag";

import { Box, Icon, Tooltip } from "metabase/ui";

import NativeVariablesButtonS from "./NativeVariablesButton.module.css";

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
  <Tooltip label={t`Variables`}>
    <Box
      component="a"
      h={size}
      className={cx(className, NativeVariablesButtonS.ButtonRoot, {
        [NativeVariablesButtonS.isSelected]: isShowingTemplateTagsEditor,
      })}
    >
      <Icon name="variable" size={size} onClick={toggleTemplateTagsEditor} />
    </Box>
  </Tooltip>
);
