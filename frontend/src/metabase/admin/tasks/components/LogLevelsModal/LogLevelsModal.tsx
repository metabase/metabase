import { useState } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import {
  useAdjustLogLevelsMutation,
  useListLoggerPresetsQuery,
} from "metabase/api/logger";
import { CodeBlock } from "metabase/components/CodeBlock";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex } from "metabase/ui";
import type { AdjustLogLevelsRequest, TimeUnit } from "metabase-types/api";
import { isErrorWithMessageResponse } from "metabase-types/guards";

import S from "./LogLevelsModal.module.css";

export const LogLevelsModal = () => {
  const dispatch = useDispatch();
  const {
    data: presets,
    error: presetsError,
    isLoading: isLoadingPresets,
  } = useListLoggerPresetsQuery();
  const [
    adjustLogLevels,
    { error: adjustLogLevelsError, isLoading: isLoadingAdjustLogLevels },
  ] = useAdjustLogLevelsMutation();
  const [duration, setDuration] = useState<number>(60);
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("minutes");
  const logLevels: AdjustLogLevelsRequest["log_levels"] = {};
  const code = JSON.stringify({ e: 1 }, null, 2);

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleReset = async () => {
    const response = await adjustLogLevels({
      duration,
      duration_unit: durationUnit,
      log_levels: {},
    });

    if (!response.error) {
      handleClose();
    }
  };

  const handleSave = async () => {
    const response = await adjustLogLevels({
      duration,
      duration_unit: durationUnit,
      log_levels: logLevels,
    });

    if (!response.error) {
      handleClose();
    }
  };

  if (presetsError || isLoadingPresets) {
    return (
      <LoadingAndErrorWrapper error={presetsError} loading={isLoadingPresets} />
    );
  }

  return (
    <ModalContent title={t`Customize log levels`} onClose={handleClose}>
      <Box className={S.codeContainer}>
        <CodeBlock code={code} language="json" />
      </Box>

      {adjustLogLevelsError ? (
        <Box c="error" mt="md">
          {getErrorMessage(adjustLogLevelsError)}
        </Box>
      ) : null}

      <Flex gap="md" justify="flex-end" mt="xl">
        <Button onClick={handleReset}>{t`Reset to defaults`}</Button>
        <Button variant="filled" onClick={handleSave}>{t`Save`}</Button>
      </Flex>
    </ModalContent>
  );
};

function getErrorMessage(error: unknown) {
  if (isErrorWithMessageResponse(error)) {
    return error.data.message;
  }

  return t`Server error encountered`;
}
