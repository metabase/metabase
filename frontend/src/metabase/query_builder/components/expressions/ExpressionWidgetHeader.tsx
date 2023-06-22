import { t } from "ttag";

import { Header, HeaderButton } from "./ExpressionWidgetHeader.styled";

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
    <Header>
      <HeaderButton icon="chevronleft" onlyText onClick={onBack}>
        {title}
      </HeaderButton>
    </Header>
  );
};
