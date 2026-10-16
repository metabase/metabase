import cx from "classnames";

import { Box, Text, UnstyledButton } from "metabase/ui";

import type { AnalysisSummary } from "../analyses/config";

import { AnalysisIllustration } from "./AnalysisIllustration";
import S from "./AnalysisTypeCard.module.css";

type AnalysisTypeCardProps = {
  config: AnalysisSummary;
  disabled: boolean;
  /** Shorter, for menus. */
  isCompact?: boolean;
  onSelect: () => void;
};

export const AnalysisTypeCard = ({
  config,
  disabled,
  isCompact = false,
  onSelect,
}: AnalysisTypeCardProps) => (
  <UnstyledButton
    className={cx(S.card, { [S.compact]: isCompact })}
    disabled={disabled}
    onClick={onSelect}
  >
    <Box>
      <Text fz="lg" fw="bold" lh="1.5rem">
        {config.name}
      </Text>
      <Text c="text-secondary">{config.question}</Text>
    </Box>
    <Box mt="auto">
      <AnalysisIllustration kind={config.kind} />
    </Box>
  </UnstyledButton>
);
