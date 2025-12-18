import cx from "classnames";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { toggleTemplateTagsEditor } from "metabase/query_builder/actions";
import { Box, Icon, Tooltip } from "metabase/ui";

import NativeVariablesButtonS from "./NativeVariablesButton.module.css";

interface NativeVariablesButtonProps {
  className?: string;
  isShowingTemplateTagsEditor: boolean;
  size: number;
}

export const NativeVariablesButton = ({
  className,
  isShowingTemplateTagsEditor,
  size,
}: NativeVariablesButtonProps) => {
  const dispatch = useDispatch();
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
        <Icon
          name="variable"
          size={size}
          onClick={() => {
            dispatch(toggleTemplateTagsEditor());
          }}
        />
      </Box>
    </Tooltip>
  );
};
