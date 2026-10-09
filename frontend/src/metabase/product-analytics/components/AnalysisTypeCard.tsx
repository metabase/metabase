import {
  Box,
  Icon,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";

import type { AnalysisConfig } from "../analyses/config";

type AnalysisTypeCardProps = {
  config: AnalysisConfig;
  disabled: boolean;
  onSelect: () => void;
};

export const AnalysisTypeCard = ({
  config,
  disabled,
  onSelect,
}: AnalysisTypeCardProps) => {
  return (
    <UnstyledButton
      disabled={disabled}
      onClick={onSelect}
      w="100%"
      h="100%"
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <Paper withBorder p="lg" h="100%" opacity={disabled ? 0.5 : 1}>
        <Stack gap="sm" align="flex-start">
          <Icon name={config.icon} size={22} c="text-secondary" />
          <Box>
            <Title order={4}>{config.name}</Title>
            <Text c="text-secondary" size="sm">
              {config.question}
            </Text>
          </Box>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
};
