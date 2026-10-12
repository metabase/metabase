import { Box, Text, UnstyledButton } from "metabase/ui";

import type { AnalysisSummary } from "../analyses/config";

import { AnalysisIllustration } from "./AnalysisIllustration";
import S from "./AnalysisTypeCard.module.css";

type AnalysisTypeCardProps = {
  config: AnalysisSummary;
  disabled: boolean;
  onSelect: () => void;
};

export const AnalysisTypeCard = ({
  config,
  disabled,
  onSelect,
}: AnalysisTypeCardProps) => (
  <UnstyledButton className={S.card} disabled={disabled} onClick={onSelect}>
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
