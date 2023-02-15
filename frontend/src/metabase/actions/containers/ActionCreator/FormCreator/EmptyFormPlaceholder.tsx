import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import {
  EmptyFormPlaceholderWrapper,
  ExplainerText,
  ExampleButton,
  IconContainer,
  TopRightIcon,
} from "./FormCreator.styled";

export const EmptyFormPlaceholder = ({
  onExampleClick,
}: {
  onExampleClick: () => void;
}) => (
  <EmptyFormPlaceholderWrapper>
    <IconContainer>
      <Icon name="sql" size={62} />
      <TopRightIcon name="insight" size={24} />
    </IconContainer>
    <h3>{t`Build custom forms and business logic.`}</h3>
    <ExplainerText>
      {t`Actions let you write parameterized SQL that can then be attached to buttons, clicks, or even added on the page as form elements.`}
    </ExplainerText>
    <ExplainerText>
      {t`Use actions to update your data based on user input or values on the page.`}
    </ExplainerText>
    <ExampleButton onClick={onExampleClick}>{t`See an example`}</ExampleButton>
  </EmptyFormPlaceholderWrapper>
);
