import { useField } from "formik";
import { useEffect, useId } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/components/CodeEditor";
import { Form, FormErrorMessage, FormSubmitButton } from "metabase/forms";
import { Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import type { LoggerPreset } from "metabase-types/api";

import { DurationInput } from "./DurationInput";
import S from "./LogLevelsForm.module.css";
import { PresetPicker } from "./PresetPicker";
import { getPresetJson } from "./utils";

interface Props {
  presets: LoggerPreset[];
}

export const LogLevelsForm = ({ presets }: Props) => {
  const codeId = useId();
  const [{ value }, { error: jsonError }, { setValue }] = useField("json");
  const [, { error: durationError }] = useField("duration");
  const error = durationError || jsonError;

  useEffect(
    function autoApplyFirstPreset() {
      if (presets.length > 0) {
        setValue(getPresetJson(presets[0]));
      }
    },
    [presets, setValue],
  );

  return (
    <Form>
      <Flex align="flex-end" gap="md" justify="space-between" mb="md">
        <DurationInput />

        {presets.length > 0 && (
          <PresetPicker
            presets={presets}
            onChange={(preset) => {
              setValue(getPresetJson(preset));
            }}
          />
        )}
      </Flex>

      <Text component="label" fw="bold" htmlFor={codeId} size="sm">
        {t`Override log configuration using`}
      </Text>

      <Box
        className={S.codeContainer}
        // Using h + mah + mih to make the CodeEditor fill its parent vertically
        h="100vh"
        mah="35vh"
        mih={200}
      >
        <CodeEditor
          className={S.code}
          id={codeId}
          language="json"
          value={value}
          onChange={setValue}
        />
      </Box>

      {error && (
        <Text aria-label={error} c="error" mt="md" role="alert">
          {error}
        </Text>
      )}

      <Box mt="md">
        <FormErrorMessage />
      </Box>

      <Flex align="center" gap="md" justify="space-between" mt="xl">
        <Tooltip
          label={t`Available log levels: ${["off", "fatal", "error", "warn", "info", "debug", "trace"].join(", ")}`}
        >
          <Icon name="info_filled" />
        </Tooltip>

        <Flex gap="md" justify="flex-end">
          <Button
            leftSection={<Icon name="revert" />}
            type="reset"
          >{t`Reset to defaults`}</Button>

          <FormSubmitButton label={t`Save`} variant="filled" />
        </Flex>
      </Flex>
    </Form>
  );
};
