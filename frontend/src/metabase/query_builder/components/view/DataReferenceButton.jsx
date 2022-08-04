/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { ReferenceIconContainer } from "./DataReferenceButton.styled";

const DataReferenceButton = ({
  isShowingDataReference,
  toggleDataReference,
  size,
  className,
}) => (
  <Tooltip tooltip={t`Learn about your data`}>
    <ReferenceIconContainer
      className={className}
      isShowingDataReference={isShowingDataReference}
    >
      <Icon name="reference" size={size} onClick={toggleDataReference} />
    </ReferenceIconContainer>
  </Tooltip>
);

DataReferenceButton.shouldRender = ({ question }) =>
  question.query() instanceof NativeQuery;

export default DataReferenceButton;
