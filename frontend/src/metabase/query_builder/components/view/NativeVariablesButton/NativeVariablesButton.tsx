import cx from "classnames";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

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
  <Tooltip tooltip={t`Variables`}>
    <a
      className={cx(className, NativeVariablesButtonS.ButtonRoot, {
        [NativeVariablesButtonS.isSelected]: isShowingTemplateTagsEditor,
      })}
    >
      <Icon name="variable" size={size} onClick={toggleTemplateTagsEditor} />
    </a>
  </Tooltip>
);
