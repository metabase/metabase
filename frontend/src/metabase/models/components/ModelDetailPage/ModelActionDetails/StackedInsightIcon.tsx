import React from "react";
import Icon from "metabase/components/Icon";
import { Root, IconSmall } from "./StackedInsightIcon.styled";

function StackedInsightIcon() {
  return (
    <Root>
      <IconSmall name="insight" size={12} />
      <Icon name="insight" size={32} />
    </Root>
  );
}

export default StackedInsightIcon;
