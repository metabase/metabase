import { type FormEvent, useEffect, useState } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import {
  useAdjustLogLevelsMutation,
  useListLoggerPresetsQuery,
  useResetLogLevelsAdjustmentMutation,
} from "metabase/api/logger";
import { CodeEditor } from "metabase/components/CodeEditor";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type { TimeUnit } from "metabase-types/api";

import { DurationInput } from "./DurationInput";
import S from "./LogLevelsModal.module.css";
import { PresetPicker } from "./PresetPicker";
import {
  getErrorMessage,
  getLogLevelsErrorMessage,
  getPresetJson,
  isJsonValid,
} from "./utils";

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
          <CodeEditor
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
            {getLogLevelsErrorMessage(adjustLogLevelsError)}
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
