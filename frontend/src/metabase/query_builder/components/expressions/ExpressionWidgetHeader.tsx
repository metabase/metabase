import { t } from "ttag";

import Button from "metabase/core/components/Button";
import { Flex } from "metabase/ui";

import ExpressionWidgetHeaderS from "./ExpressionWidgetHeader.module.css";

const DEFAULT_SECTION_NAME = t`Custom Expression`;

interface Props {
  title?: string;

  onBack: () => void;
}

export const ExpressionWidgetHeader = ({
  title = DEFAULT_SECTION_NAME,
  onBack,
}: Props): JSX.Element => {
  return (
    <Flex className={ExpressionWidgetHeaderS.Header}>
      <Button
        className={ExpressionWidgetHeaderS.HeaderButton}
        icon="chevronleft"
        onlyText
        onClick={onBack}
      >
        {title}
      </Button>
    </Flex>
  );
};
