import { t } from "ttag";

import { Flex, PopoverBackButton, Text } from "metabase/ui";

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
      {onBack ? (
        <PopoverBackButton
          c="text-secondary"
          aria-label={title}
          onClick={onBack}
        >
          {title}
        </PopoverBackButton>
      ) : (
        <Text c="text-secondary" fw="bold">
          {title}
        </Text>
      )}
    </Flex>
  );
};
