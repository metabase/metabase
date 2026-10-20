import { t } from "ttag";

import { Title, UnstyledButton } from "metabase/ui";

import S from "./AnalysisNode.module.css";

type AnalysisTitleButtonProps = {
  title: string;
  onClick: () => void;
};

/** The card's title, which opens the chart in a modal. */
export const AnalysisTitleButton = ({
  title,
  onClick,
}: AnalysisTitleButtonProps) => (
  <UnstyledButton
    className={S.titleButton}
    aria-label={t`Open ${title} in a modal`}
    onClick={onClick}
  >
    <Title order={4} c="inherit">
      {title}
    </Title>
  </UnstyledButton>
);
