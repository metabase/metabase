import type { JSX } from "react";
import { t } from "ttag";

import { Button, Flex, Icon } from "metabase/ui";

import ExpressionWidgetHeaderS from "./ExpressionWidgetHeader.module.css";

const getDefaultSectionName = () => t`Custom Expression`;

interface Props {
  title?: string;

  onBack?: () => void;
}

export const ExpressionWidgetHeader = ({
  title = getDefaultSectionName(),
  onBack,
}: Props): JSX.Element => {
  return (
    <Flex className={ExpressionWidgetHeaderS.Header}>
      <Button
        className={ExpressionWidgetHeaderS.HeaderButton}
        variant="subtle"
        leftSection={onBack ? <Icon name="chevronleft" /> : undefined}
        onClick={onBack}
        disabled={!onBack}
      >
        {title}
      </Button>
    </Flex>
  );
};
