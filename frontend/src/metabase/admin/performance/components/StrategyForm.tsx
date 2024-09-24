import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Schedule } from "metabase/components/Schedule/Schedule";
import type { FormTextInputProps } from "metabase/forms";
import {
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
  useFormContext,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_CACHING } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import {
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Icon,
  Radio,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type {
  CacheStrategy,
  CacheStrategyType,
  CacheableModel,
  ScheduleSettings,
  ScheduleStrategy,
} from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";

import { strategyValidationSchema } from "../constants/complex";
import { rootId } from "../constants/simple";
import { useIsFormPending } from "../hooks/useIsFormPending";
import { isModelWithClearableCache } from "../types";
import {
  cronToScheduleSettings,
  getDefaultValueForField,
  getLabelString,
  scheduleSettingsToCron,
} from "../utils";

import {
  FormBox,
  FormWrapper,
  LoaderInButton,
  StyledForm,
  StyledFormButtonsGroup,
} from "./StrategyForm.styled";

interface ButtonLabels {
  save: string;
  discard: string;
}

export const StrategyForm = ({
  targetId,
  targetModel,
  targetName,
  setIsDirty,
  saveStrategy,
  savedStrategy,
  shouldAllowInvalidation = false,
  shouldShowName = true,
  onReset,
  isInSidebar = false,
  buttonLabels = isInSidebar
    ? {
        save: t`Save`,
        discard: t`Cancel`,
      }
    : {
        save: t`Save changes`,
        discard: t`Discard changes`,
      },
}: {
  targetId: number | null;
  targetModel: CacheableModel;
  targetName: string;
  setIsDirty: (isDirty: boolean) => void;
  saveStrategy: (values: CacheStrategy) => Promise<void>;
  savedStrategy?: CacheStrategy;
  shouldAllowInvalidation?: boolean;
  shouldShowName?: boolean;
  onReset?: () => void;
  buttonLabels?: ButtonLabels;
  isInSidebar?: boolean;
}) => {
  const defaultStrategy: CacheStrategy = useMemo(
    () => ({
      type: targetId === rootId ? "nocache" : "inherit",
    }),
    [targetId],
  );

  const initialValues = savedStrategy ?? defaultStrategy;

  return (
    <FormProvider<CacheStrategy>
      key={targetId}
      initialValues={initialValues}
      validationSchema={strategyValidationSchema}
      onSubmit={saveStrategy}
      onReset={onReset}
      enableReinitialize
    >
      <StrategyFormBody
        targetId={targetId}
        targetModel={targetModel}
        targetName={targetName}
        setIsDirty={setIsDirty}
        shouldAllowInvalidation={shouldAllowInvalidation}
        shouldShowName={shouldShowName}
        buttonLabels={buttonLabels}
        isInSidebar={isInSidebar}
        strategyType={initialValues.type}
      />
    </FormProvider>
  );
};

/** Don't count the addition/deletion of a default value as a reason to consider the form dirty */
const isFormDirty = (values: CacheStrategy, initialValues: CacheStrategy) => {
  const fieldNames = [...Object.keys(values), ...Object.keys(initialValues)];
  const defaultValues = _.object(
    _.map(fieldNames, fieldName => [
      fieldName,
      getDefaultValueForField(values.type, fieldName),
    ]),
  );
  const initialValuesWithDefaults = { ...defaultValues, ...initialValues };
  const valuesWithDefaults = { ...defaultValues, ...values };
  // If the default value is a number and the value is a string, coerce the value to a number
  const coercedValuesWithDefaults = _.chain(valuesWithDefaults)
    .pairs()
    .map(([key, value]) => [
      key,
      typeof getDefaultValueForField(values.type, key) === "number" &&
      typeof value === "string"
        ? Number(value)
        : value,
    ])
    .object()
    .value();
  return !_.isEqual(initialValuesWithDefaults, coercedValuesWithDefaults);
};

const StrategyFormBody = ({
  targetId,
  targetModel,
  targetName,
  setIsDirty,
  shouldAllowInvalidation,
  shouldShowName = true,
  buttonLabels,
  isInSidebar,
}: {
  targetId: number | null;
  targetModel: CacheableModel;
  targetName: string;
  strategyType: CacheStrategyType;
  setIsDirty: (isDirty: boolean) => void;
  shouldAllowInvalidation: boolean;
  shouldShowName?: boolean;
  buttonLabels: ButtonLabels;
  isInSidebar?: boolean;
}) => {
  const { values, initialValues, setFieldValue } =
    useFormikContext<CacheStrategy>();

  const dirty = useMemo(
    () => isFormDirty(values, initialValues),
    [values, initialValues],
  );

  const { setStatus } = useFormContext();
  const [wasDirty, setWasDirty] = useState(false);

  const selectedStrategyType = values.type;

  useEffect(() => {
    setIsDirty(dirty);
  }, [dirty, setIsDirty]);

  useEffect(() => {
    // When form becomes dirty, reset form status to idle
    setWasDirty(dirty);
    if (dirty && !wasDirty) {
      setStatus("idle");
    }
  }, [dirty, wasDirty, setIsDirty, setStatus]);

  useEffect(() => {
    if (selectedStrategyType === "duration") {
      setFieldValue("unit", CacheDurationUnit.Hours);
    }
  }, [selectedStrategyType, values, setFieldValue]);

  const headingId = "strategy-form-heading";

  return (
    <FormWrapper>
      <StyledForm
        style={{ overflow: isInSidebar ? undefined : "auto" }}
        aria-labelledby={headingId}
        data-testid={`strategy-form-for-${targetModel}-${targetId}`}
      >
        <FormBox isInSidebar={isInSidebar}>
          {shouldShowName && (
            <Box lh="1rem" pt="md" color="text-medium">
              <Group spacing="sm">
                {targetModel === "database" && (
                  <FixedSizeIcon name="database" color="inherit" />
                )}
                <Text fw="bold" py="1rem">
                  {targetName}
                </Text>
              </Group>
            </Box>
          )}
          <Stack maw="35rem" pt={targetId === rootId ? "xl" : 0} spacing="xl">
            <StrategySelector
              targetId={targetId}
              model={targetModel}
              headingId={headingId}
            />
            {selectedStrategyType === "ttl" && (
              <>
                <Field
                  title={t`Minimum query duration`}
                  subtitle={
                    <Text size="sm">
                      {t`Metabase will cache all saved questions with an average query execution time greater than this many seconds.`}
                    </Text>
                  }
                >
                  <PositiveNumberInput
                    strategyType="ttl"
                    name="min_duration_seconds"
                  />
                </Field>
                <Field
                  title={t`Multiplier`}
                  subtitle={<MultiplierFieldSubtitle />}
                >
                  <PositiveNumberInput strategyType="ttl" name="multiplier" />
                </Field>
              </>
            )}
            {selectedStrategyType === "duration" && (
              <>
                <Field title={t`Cache results for this many hours`}>
                  <PositiveNumberInput
                    strategyType="duration"
                    name="duration"
                  />
                </Field>
                <input type="hidden" name="unit" />
              </>
            )}
            {selectedStrategyType === "schedule" && (
              <ScheduleStrategyFormFields />
            )}
          </Stack>
        </FormBox>
        <FormButtons
          targetId={targetId}
          targetModel={targetModel}
          targetName={targetName}
          shouldAllowInvalidation={shouldAllowInvalidation}
          buttonLabels={buttonLabels}
          isInSidebar={isInSidebar}
          dirty={dirty}
        />
      </StyledForm>
    </FormWrapper>
  );
};

const FormButtonsGroup = ({
  children,
  isInSidebar,
}: {
  children: ReactNode;
  isInSidebar?: boolean;
}) => {
  return (
    <StyledFormButtonsGroup isInSidebar={isInSidebar}>
      {children}
    </StyledFormButtonsGroup>
  );
};

type FormButtonsProps = {
  targetId: number | null;
  targetModel: CacheableModel;
  shouldAllowInvalidation: boolean;
  targetName?: string;
  buttonLabels: ButtonLabels;
  isInSidebar?: boolean;
  dirty: boolean;
};

const FormButtons = ({
  targetId,
  targetModel,
  shouldAllowInvalidation,
  targetName,
  buttonLabels,
  isInSidebar,
  dirty,
}: FormButtonsProps) => {
  if (targetId === rootId) {
    shouldAllowInvalidation = false;
  }

  const { isFormPending, wasFormRecentlyPending } = useIsFormPending();

  const isSavingPossible = dirty || isFormPending || wasFormRecentlyPending;

  if (isSavingPossible) {
    return (
      <FormButtonsGroup isInSidebar={isInSidebar}>
        <SaveAndDiscardButtons
          dirty={dirty}
          isFormPending={isFormPending}
          buttonLabels={buttonLabels}
          isInSidebar={isInSidebar}
        />
      </FormButtonsGroup>
    );
  }

  if (
    shouldAllowInvalidation &&
    isModelWithClearableCache(targetModel) &&
    targetId &&
    targetName
  ) {
    return (
      <FormButtonsGroup isInSidebar={isInSidebar}>
        <PLUGIN_CACHING.InvalidateNowButton
          targetId={targetId}
          targetModel={targetModel}
          targetName={targetName}
        />
      </FormButtonsGroup>
    );
  }

  return null;
};

const ScheduleStrategyFormFields = () => {
  const { values, setFieldValue } = useFormikContext<ScheduleStrategy>();
  const { schedule: scheduleInCronFormat } = values;
  const initialSchedule = cronToScheduleSettings(scheduleInCronFormat);
  const [schedule, setSchedule] = useState<ScheduleSettings>(
    initialSchedule || {},
  );
  const timezone = useSelector(state =>
    getSetting(state, "report-timezone-short"),
  );
  const onScheduleChange = useCallback(
    (nextSchedule: ScheduleSettings) => {
      setSchedule(nextSchedule);
      const cron = scheduleSettingsToCron(nextSchedule);
      setFieldValue("schedule", cron);
    },
    [setFieldValue, setSchedule],
  );
  if (!initialSchedule) {
    return (
      <LoadingAndErrorWrapper
        error={t`Error: Cannot interpret schedule: ${scheduleInCronFormat}`}
      />
    );
  }
  return (
    <Schedule
      schedule={schedule}
      scheduleOptions={["hourly", "daily", "weekly", "monthly"]}
      onScheduleChange={onScheduleChange}
      verb={c("A verb in the imperative mood").t`Invalidate`}
      timezone={timezone}
      aria-label={t`Describe how often the cache should be invalidated`}
    />
  );
};

const SaveAndDiscardButtons = ({
  dirty,
  isFormPending,
  buttonLabels,
  isInSidebar,
}: {
  dirty: boolean;
  isFormPending: boolean;
  buttonLabels: ButtonLabels;
  isInSidebar?: boolean;
}) => {
  return (
    <>
      <Button
        p="sm"
        variant="subtle"
        disabled={!dirty || isFormPending}
        type="reset"
      >
        {buttonLabels.discard}
      </Button>
      <FormSubmitButton
        miw={isInSidebar ? undefined : "10rem"}
        h="40px"
        label={buttonLabels.save}
        successLabel={
          <Group spacing="xs">
            <Icon name="check" /> {t`Saved`}
          </Group>
        }
        activeLabel={<LoaderInButton size="1rem" />}
        variant="filled"
        data-testid="strategy-form-submit-button"
        className="strategy-form-submit-button"
      />
    </>
  );
};

const StrategySelector = ({
  targetId,
  model,
  headingId,
}: {
  targetId: number | null;
  model?: CacheableModel;
  headingId: string;
}) => {
  const { strategies } = PLUGIN_CACHING;

  const { values } = useFormikContext<CacheStrategy>();

  const availableStrategies = useMemo(() => {
    return targetId === rootId ? _.omit(strategies, "inherit") : strategies;
  }, [targetId, strategies]);

  return (
    <section>
      <FormRadioGroup
        label={
          <Stack spacing="xs">
            <Text lh="1rem" color="text-medium" id={headingId}>
              {t`Select the cache invalidation policy`}
            </Text>
            <Text lh="1rem" fw="normal" size="sm" color="text-medium">
              {t`This determines how long cached results will be stored.`}
            </Text>
          </Stack>
        }
        name="type"
      >
        <Stack mt="md" spacing="md">
          {_.map(availableStrategies, (option, name) => {
            const labelString = getLabelString(option.label, model);
            /** Special colon sometimes used in Asian languages */
            const wideColon = "：";
            const colon = labelString.includes(wideColon) ? wideColon : ":";
            const optionLabelParts = labelString.split(colon);
            const optionLabelFormatted = (
              <>
                <strong>{optionLabelParts[0]}</strong>
                {optionLabelParts[1] ? (
                  <>
                    {colon} {optionLabelParts[1]}
                  </>
                ) : null}
              </>
            );
            return (
              <Radio
                value={name}
                key={name}
                label={optionLabelFormatted}
                autoFocus={values.type === name}
                role="radio"
                styles={{
                  label: {
                    paddingLeft: undefined,
                    paddingInlineStart: ".5rem",
                  },
                }}
              />
            );
          })}
        </Stack>
      </FormRadioGroup>
    </section>
  );
};

export const PositiveNumberInput = ({
  strategyType,
  ...props
}: {
  strategyType: CacheStrategyType;
} & Partial<FormTextInputProps>) => {
  return (
    <FormTextInput
      type="number"
      name={props.name ?? ""}
      min={1}
      styles={{
        input: {
          // This is like `text-align: right` but it's RTL-friendly
          textAlign: "end",
          maxWidth: "4.5rem",
        },
      }}
      autoComplete="off"
      placeholder={getDefaultValueForField(strategyType, props.name)}
      {...props}
    />
  );
};

const Field = ({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <label>
      <Stack spacing="xs">
        <div>
          <Title order={4}>{title}</Title>
          {subtitle}
        </div>
        {children}
      </Stack>
    </label>
  );
};

const MultiplierFieldSubtitle = () => (
  <Text size="sm">
    {t`To determine how long each cached result should stick around, we take that query's average execution time and multiply that by what you input here. The result is how many seconds the cache should remain valid for.`}{" "}
    <Tooltip
      multiline
      inline={true}
      position="bottom"
      label={t`If a query takes on average 120 seconds (2 minutes) to run, and you input 10 for your multiplier, its cache entry will persist for 1,200 seconds (20 minutes).`}
      maw="20rem"
    >
      <Text tabIndex={0} size="sm" lh="1" display="inline" c="brand">
        {t`Example`}
      </Text>
    </Tooltip>
  </Text>
);
