import { type FormEvent, useEffect, useState } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import {
  useAdjustLogLevelsMutation,
  useListLoggerPresetsQuery,
  useResetLogLevelsAdjustmentMutation,
} from "metabase/api/logger";
import { CodeBlock } from "metabase/components/CodeBlock";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type { LoggerPreset, TimeUnit } from "metabase-types/api";
import { isErrorWithMessageResponse } from "metabase-types/guards";

import { DurationInput } from "./DurationInput";
import S from "./LogLevelsModal.module.css";
import { PresetPicker } from "./PresetPicker";

export const LogLevelsModal = () => {
  const dispatch = useDispatch();
  const {
    data: presets = [],
    error: presetsError,
    isLoading: isLoadingPresets,
  } = useListLoggerPresetsQuery();
  const [
    adjustLogLevels,
    { error: adjustLogLevelsError, isLoading: isLoadingAdjustLogLevels },
  ] = useAdjustLogLevelsMutation();
  const [
    resetLogLevelsAdjustment,
    { error: resetError, isLoading: isLoadingReset },
  ] = useResetLogLevelsAdjustmentMutation();

  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("minutes");
  const [json, setJson] = useState("");
  const durationNumber = parseInt(duration, 10);
  const isDurationValid = Number.isFinite(durationNumber);
  const isValid = isDurationValid && isJsonValid(json);
  const isLoading = isLoadingAdjustLogLevels || isLoadingReset;

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleReset = async () => {
    const response = await resetLogLevelsAdjustment();

    if (!response.error) {
      handleClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const response = await adjustLogLevels({
      duration: durationNumber,
      duration_unit: durationUnit,
      log_levels: JSON.parse(json),
    });

    if (!response.error) {
      handleClose();
    }
  };

  useEffect(
    function autoApplyFirstPreset() {
      if (presets.length > 0) {
        setJson(getPresetJson(presets[0]));
      }
    },
    [presets],
  );

  if (presetsError || isLoadingPresets) {
    return (
      <ModalContent title={t`Customize log levels`} onClose={handleClose}>
        <LoadingAndErrorWrapper
          error={presetsError}
          loading={isLoadingPresets}
        />
      </ModalContent>
    );
  }

  return (
    <ModalContent title={t`Customize log levels`} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <Flex align="flex-end" gap="md" justify="space-between" mb="md">
          <DurationInput
            duration={duration}
            durationUnit={durationUnit}
            onDurationChange={setDuration}
            onDurationUnitChange={setDurationUnit}
          />

          {presets.length > 0 && (
            <PresetPicker
              presets={presets}
              onChange={(preset) => {
                setJson(getPresetJson(preset));
              }}
            />
          )}
        </Flex>

        <Box
          className={S.codeContainer}
          // Using h + mah + mih to make the CodeBlock fill its parent vertically
          h="100vh"
          mah="35vh"
          mih={200}
        >
          <CodeBlock
            className={S.code}
            language="json"
            value={json}
            onChange={(value) => setJson(value)}
          />
        </Box>

        {resetError ? (
          <Box c="error" mt="md">
            {getErrorMessage(resetError)}
          </Box>
        ) : null}

        {adjustLogLevelsError ? (
          <Box c="error" mt="md">
            {getErrorMessage(adjustLogLevelsError)}
          </Box>
        ) : null}

        <Flex gap="md" justify="flex-end" mt="xl">
          <Flex align="center">{isLoading && <Loader size="sm" />}</Flex>

          <Button
            disabled={isLoading}
            leftSection={<Icon name="revert" />}
            type="button"
            onClick={handleReset}
          >{t`Reset to defaults`}</Button>

          <Button
            disabled={isLoading || !isValid}
            type="submit"
            variant="filled"
          >{t`Save`}</Button>
        </Flex>
      </form>
    </ModalContent>
  );
};

function getPresetJson(preset: LoggerPreset) {
  const logLevels = Object.fromEntries(
    preset.loggers.map(({ level, name }) => [name, level]),
  );
  return JSON.stringify(logLevels, null, 2);
}

function getErrorMessage(error: unknown) {
  if (isErrorWithMessageResponse(error)) {
    return error.data.message;
  }

  return t`Server error encountered`;
}

function isJsonValid(json: string): boolean {
  try {
    JSON.parse(json);
    return true;
  } catch (_error) {
    return false;
  }
}
