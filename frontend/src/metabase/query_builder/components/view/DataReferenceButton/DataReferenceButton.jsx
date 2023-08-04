/* eslint-disable react/prop-types */
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { ButtonRoot } from "./DataReferenceButton.styled";

export const DataReferenceButton = ({
  isShowingDataReference,
  toggleDataReference,
  size,
  className,
}) => (
  <Tooltip tooltip={t`Learn about your data`}>
    <ButtonRoot className={className} isSelected={isShowingDataReference}>
      <Icon name="reference" size={size} onClick={toggleDataReference} />
    </ButtonRoot>
  </Tooltip>
);

DataReferenceButton.shouldRender = ({ question }) =>
  question.query() instanceof NativeQuery;
