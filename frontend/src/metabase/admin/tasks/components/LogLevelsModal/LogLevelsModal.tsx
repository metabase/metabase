import { type FormEvent, useEffect, useState } from "react";
import { t } from "ttag";

import {
  useAdjustLogLevelsMutation,
  useListLoggerPresetsQuery,
  useResetLogLevelsMutation,
} from "metabase/api/logger";
import { CodeEditor } from "metabase/components/CodeEditor";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { Box, Button, Flex, Icon, Loader, Tooltip } from "metabase/ui";
import type { LoggerDurationUnit } from "metabase-types/api";

import { DurationInput } from "./DurationInput";
import S from "./LogLevelsModal.module.css";
import { PresetPicker } from "./PresetPicker";
import {
  getErrorMessage,
  getLogLevelsErrorMessage,
  getPresetJson,
  isJsonValid,
} from "./utils";

interface Props {
  onClose: () => void;
}

export const LogLevelsModal = ({ onClose }: Props) => {
  const {
    data: presets = [],
    error: presetsError,
    isLoading: isLoadingPresets,
  } = useListLoggerPresetsQuery();
  const [adjust, { error: adjustError, isLoading: isLoadingAdjust }] =
    useAdjustLogLevelsMutation();
  const [reset, { error: resetError, isLoading: isLoadingReset }] =
    useResetLogLevelsMutation();

  const [duration, setDuration] = useState<number | "">(60);
  const [durationUnit, setDurationUnit] =
    useState<LoggerDurationUnit>("minutes");
  const [json, setJson] = useState("");
  const isDurationValid =
    typeof duration === "number" && Number.isFinite(duration) && duration >= 0;
  const isValid = isDurationValid && isJsonValid(json);
  const isLoading = isLoadingAdjust || isLoadingReset;

  const handleReset = async () => {
    const response = await reset();

    if (!response.error) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isValid) {
      return;
    }

    const response = await adjust({
      duration,
      duration_unit: durationUnit,
      log_levels: JSON.parse(json),
    });

    if (!response.error) {
      onClose();
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
      <ModalContent title={t`Customize log levels`} onClose={onClose}>
        <LoadingAndErrorWrapper
          error={presetsError}
          loading={isLoadingPresets}
        />
      </ModalContent>
    );
  }

  return (
    <ModalContent title={t`Customize log levels`} onClose={onClose}>
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
          // Using h + mah + mih to make the CodeEditor fill its parent vertically
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

        {adjustError ? (
          <Box c="error" mt="md">
            {getLogLevelsErrorMessage(adjustError)}
          </Box>
        ) : null}

        <Flex align="center" gap="md" justify="space-between" mt="xl">
          <Tooltip
            label={t`Available log levels: ${["off", "fatal", "error", "warn", "info", "debug", "trace"].join(", ")}`}
          >
            <Icon name="info_filled" />
          </Tooltip>

          <Flex gap="md" justify="flex-end">
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
        </Flex>
      </form>
    </ModalContent>
  );
};
