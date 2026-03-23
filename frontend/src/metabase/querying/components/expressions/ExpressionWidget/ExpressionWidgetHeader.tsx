import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Flex } from "metabase/ui";

import ExpressionWidgetHeaderS from "./ExpressionWidgetHeader.module.css";

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const DEFAULT_SECTION_NAME = t`Custom Expression`;

interface Props {
  title?: string;

  onBack?: () => void;
}

export const ExpressionWidgetHeader = ({
  title = DEFAULT_SECTION_NAME,
  onBack,
}: Props): JSX.Element => {
  return (
    <Flex className={ExpressionWidgetHeaderS.Header}>
      <Button
        className={ExpressionWidgetHeaderS.HeaderButton}
        icon={onBack ? "chevronleft" : undefined}
        onlyText
        onClick={onBack}
        disabled={!onBack}
      >
        {title}
      </Button>
    </Flex>
  );
};
