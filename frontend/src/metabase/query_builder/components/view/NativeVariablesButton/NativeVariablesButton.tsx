import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import type Question from "metabase-lib/Question";
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

NativeVariablesButton.shouldRender = ({ question }: { question: Question }) =>
  question.isNative() && question.database()?.hasFeature?.("native-parameters");
