import type { ComponentProps } from "react";

import { Box, Modal, Stack, Text } from "metabase/ui";

import { AnalysisResult } from "../components/AnalysisResult";

type AnalysisChartModalProps = {
  title: string;
  question: string;
  result: ComponentProps<typeof AnalysisResult>;
  onClose: () => void;
};

/** An analysis's chart, large, for a closer look without editing it. */
export const AnalysisChartModal = ({
  title,
  question,
  result,
  onClose,
}: AnalysisChartModalProps) => (
  <Modal opened title={title} size="90vw" onClose={onClose}>
    <Stack gap="md">
      <Text c="text-secondary">{question}</Text>
      <Box h="75vh">
        <AnalysisResult {...result} />
      </Box>
    </Stack>
  </Modal>
);
