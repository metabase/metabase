/* eslint-disable react/prop-types */
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { ButtonRoot } from "./NativeVariablesButton.styled";

export const NativeVariablesButton = ({
  toggleTemplateTagsEditor,
  isShowingTemplateTagsEditor,
  className,
  size,
}) => (
  <Tooltip tooltip={t`Variables`}>
    <ButtonRoot className={className} isSelected={isShowingTemplateTagsEditor}>
      <Icon name="variable" size={size} onClick={toggleTemplateTagsEditor} />
    </ButtonRoot>
  </Tooltip>
);

NativeVariablesButton.shouldRender = ({ question }) =>
  question.query() instanceof NativeQuery &&
  question.database() &&
  question.database().hasFeature("native-parameters");
