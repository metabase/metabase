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
import {
  Box,
  Button,
  Flex,
  Loader,
  Menu,
  Select,
  TextInput,
} from "metabase/ui";
import type { TimeUnit } from "metabase-types/api";
import { isErrorWithMessageResponse } from "metabase-types/guards";

import S from "./LogLevelsModal.module.css";

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
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("minutes");
  const [json, setJson] = useState("");
  const durationNumber = parseInt(duration, 10);
  const isDurationValid = Number.isFinite(durationNumber);
  const isValid = isDurationValid && isJsonValid(json);

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
      log_levels: JSON.parse(json),
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
        <Flex align="flex-end" gap="md" justify="space-between" mb="xl">
          <Menu position="bottom-start" shadow="md" width={200}>
            <Menu.Target>
              <Button>Load preset</Button>
            </Menu.Target>

            <Menu.Dropdown>
              {presets.map((preset) => (
                <Menu.Item
                  key={preset.id}
                  onClick={() => {
                    const logLevels = Object.fromEntries(
                      preset.loggers.map(({ level, name }) => [name, level]),
                    );
                    const json = JSON.stringify(logLevels, null, 2);
                    setJson(json);
                  }}
                >
                  {preset.display_name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

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
              data={getData()}
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

// It intentionally is a function and not a module-level constant, so that `t` function works correctly
function getData() {
  /**
   * Using a Record, so that this gives compilation error when TimeUnit is extended,
   * so that whoever changes that type does not forget to update this function.
   */
  const statusNames: { [T in TimeUnit]: { label: string; value: T } } = {
    nanoseconds: { label: t`Nanoseconds`, value: "nanoseconds" },
    microseconds: { label: t`Microseconds`, value: "microseconds" },
    milliseconds: { label: t`Milliseconds`, value: "milliseconds" },
    seconds: { label: t`Seconds`, value: "seconds" },
    minutes: { label: t`Minutes`, value: "minutes" },
    hours: { label: t`Hours`, value: "hours" },
    days: { label: t`Days`, value: "days" },
  };

  return Object.values(statusNames);
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
