import { useEffect } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Box, Loader, Text } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

type ProcessingStepProps = {
  processingStatus: string;
  database: DatabaseData | null;
};

export const ProcessingStep = ({
  processingStatus,
  database,
}: ProcessingStepProps) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (database && processingStatus === "Setting up embedding...") {
      // Wait a bit to show the final status before moving to the next step
      const timer = setTimeout(() => {
        dispatch(push("/setup/embedding/final"));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [database, processingStatus, dispatch]);

  return (
    <Box>
      <Text size="xl" fw="bold" mb="md">
        {t`Setting Up Your Database`}
      </Text>
      <Box ta="center" mb="xl">
        <Loader size="lg" mb="md" />
        <Text>{processingStatus}</Text>
      </Box>
    </Box>
  );
};
