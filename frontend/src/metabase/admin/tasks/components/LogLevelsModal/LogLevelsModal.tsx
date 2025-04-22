import { type FormEvent, useState } from "react";
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
import { Box, Button, Flex, Loader, Select, TextInput } from "metabase/ui";
import type { AdjustLogLevelsRequest, TimeUnit } from "metabase-types/api";
import { isErrorWithMessageResponse } from "metabase-types/guards";

import S from "./LogLevelsModal.module.css";

const TIME_UNITS: TimeUnit[] = [
  "nanoseconds",
  "microseconds",
  "milliseconds",
  "seconds",
  "minutes",
  "hours",
  "days",
];

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
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("minutes");
  const [json, setJson] = useState("");
  const durationNumber = parseInt(duration, 10);
  const isDurationValid = Number.isFinite(durationNumber);
  const isValid = isDurationValid && isJsonValid(json);
  const logLevels: AdjustLogLevelsRequest["log_levels"] = {}; // TODO

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleReset = async () => {
    const response = await adjustLogLevels({
      duration: durationNumber,
      duration_unit: durationUnit,
      log_levels: {},
    });

    if (!response.error) {
      handleClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const response = await adjustLogLevels({
      duration: durationNumber,
      duration_unit: durationUnit,
      log_levels: logLevels,
    });

    if (!response.error) {
      handleClose();
    }
  };

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
        <Flex gap="md" justify="space-between" mb="xl">
          <Flex gap="md">
            <TextInput
              label={t`Duration`}
              placeholder={t`Duration`}
              required
              type="number"
              value={duration}
              w={80}
              onChange={(event) => setDuration(event.target.value)}
            />

            <Select
              data={TIME_UNITS}
              label={t`Unit`}
              placeholder={t`Unit`}
              value={durationUnit}
              w={140}
              onChange={setDurationUnit}
            />
          </Flex>
        </Flex>

        <Box className={S.codeContainer} mih={200}>
          <CodeBlock
            language="json"
            value={json}
            onChange={(value) => setJson(value)}
          />
        </Box>

        {adjustLogLevelsError ? (
          <Box c="error" mt="md">
            {getErrorMessage(adjustLogLevelsError)}
          </Box>
        ) : null}

        <Flex gap="md" justify="flex-end" mt="xl">
          <Flex align="center">
            {isLoadingAdjustLogLevels && <Loader size="sm" />}
          </Flex>

          <Button
            disabled={isLoadingAdjustLogLevels}
            onClick={handleReset}
          >{t`Reset to defaults`}</Button>

          <Button
            disabled={isLoadingAdjustLogLevels || !isValid}
            type="submit"
            variant="filled"
          >{t`Save`}</Button>
        </Flex>
      </form>
    </ModalContent>
  );
};

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
