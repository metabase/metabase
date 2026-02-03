import { t } from "ttag";
import * as Yup from "yup";

import {
  useAdjustLogLevelsMutation,
  useListLoggerPresetsQuery,
  useResetLogLevelsMutation,
} from "metabase/api/logger";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ModalContent } from "metabase/common/components/ModalContent";
import { FormProvider } from "metabase/forms";
import type { LoggerDurationUnit } from "metabase-types/api";

import { LogLevelsForm } from "./LogLevelsForm";
import type { AllowedTimeUnit } from "./types";

interface Props {
  onClose: () => void;
}

type FormState = {
  duration: number;
  durationUnit: LoggerDurationUnit;
  json: string;
};

const VALIDATION_SCHEMA = Yup.object({
  duration: Yup.number().required().positive().integer(),
  durationUnit: Yup.mixed<AllowedTimeUnit>()
    .oneOf(["days", "hours", "minutes", "seconds"])
    .required(),
  json: Yup.string()
    .required()
    .test("is-json", "Invalid JSON", (value) => {
      try {
        JSON.parse(value ?? "");
        return true;
      } catch {
        return false;
      }
    }),
});

export const LogLevelsModal = ({ onClose }: Props) => {
  const {
    data: presets = [],
    error: presetsError,
    isLoading: isLoadingPresets,
  } = useListLoggerPresetsQuery();
  const [adjust] = useAdjustLogLevelsMutation();
  const [reset] = useResetLogLevelsMutation();

  const handleReset = async () => {
    const response = await reset();

    if (response.error) {
      throw response.error;
    } else {
      onClose();
    }
  };

  const handleSubmit = async (values: FormState) => {
    const response = await adjust({
      duration: values.duration,
      duration_unit: values.durationUnit,
      log_levels: JSON.parse(values.json),
    });

    if (response.error) {
      throw response.error;
    } else {
      onClose();
    }
  };

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
      <FormProvider
        initialValues={{
          duration: 60,
          durationUnit: "minutes",
          json: "",
        }}
        validationSchema={VALIDATION_SCHEMA}
        onReset={handleReset}
        onSubmit={handleSubmit}
      >
        <LogLevelsForm presets={presets} />
      </FormProvider>
    </ModalContent>
  );
};
