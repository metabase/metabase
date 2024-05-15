import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Schedule } from "metabase/components/Schedule/Schedule";
import type { FormTextInputProps } from "metabase/forms";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
  useFormContext,
} from "metabase/forms";
import { color } from "metabase/lib/colors";
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
  CacheableModel,
  ScheduleSettings,
  ScheduleStrategy,
  Strategy,
  StrategyType,
} from "metabase-types/api";
import { DurationUnit } from "metabase-types/api";

import { useIsFormPending } from "../hooks/useIsFormPending";
import {
  getLabelString,
  rootId,
  Strategies,
  strategyValidationSchema,
} from "../strategies";
import { cronToScheduleSettings, scheduleSettingsToCron } from "../utils";

import { LoaderInButton } from "./StrategyForm.styled";

export const StrategyForm = ({
  targetId,
  targetModel,
  targetName,
  setIsDirty,
  saveStrategy,
  savedStrategy,
  shouldAllowInvalidation = false,
  shouldShowName = true,
  formStyle = {},
  onReset,
}: {
  targetId: number | null;
  targetModel: CacheableModel;
  targetName: string;
  setIsDirty: (isDirty: boolean) => void;
  saveStrategy: (values: Strategy) => Promise<void>;
  savedStrategy?: Strategy;
  shouldAllowInvalidation?: boolean;
  shouldShowName?: boolean;
  formStyle?: React.CSSProperties;
  onReset?: () => void;
}) => {
  const defaultStrategy: Strategy = {
    type: targetId === rootId ? "nocache" : "inherit",
  };

  return (
    <FormProvider<Strategy>
      key={targetId}
      initialValues={savedStrategy ?? defaultStrategy}
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
        formStyle={formStyle}
      />
    </FormProvider>
  );
};

const StrategyFormBody = ({
  targetId,
  targetModel,
  targetName,
  setIsDirty,
  shouldAllowInvalidation,
  shouldShowName = true,
  formStyle = {},
}: {
  targetId: number | null;
  targetModel: CacheableModel;
  targetName: string;
  setIsDirty: (isDirty: boolean) => void;
  shouldAllowInvalidation: boolean;
  shouldShowName?: boolean;
  formStyle?: React.CSSProperties;
}) => {
  const { dirty, values, setFieldValue } = useFormikContext<Strategy>();
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
      setFieldValue("unit", DurationUnit.Hours);
    }
  }, [selectedStrategyType, values, setFieldValue]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Form
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          ...formStyle,
        }}
      >
        <Box
          className="strategy-form-box"
          style={{
            borderBottom: `1px solid ${color("border")}`,
            overflow: "auto",
            flexGrow: 1,
          }}
        >
          {shouldShowName && (
            <Box lh="1rem" px="lg" py="xs" color="text-medium">
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
          <Stack
            maw="35rem"
            p="lg"
            pt={targetId === rootId ? undefined : 0}
            spacing="xl"
          >
            <StrategySelector targetId={targetId} model={targetModel} />
            {selectedStrategyType === "ttl" && (
              <>
                <Field
                  title={t`Minimum query duration`}
                  subtitle={t`Metabase will cache all saved questions with an average query execution time greater than this many seconds.`}
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
        </Box>
        <FormButtons
          targetId={targetId}
          targetModel={targetModel}
          targetName={targetName}
          shouldAllowInvalidation={shouldAllowInvalidation}
        />
      </Form>
    </div>
  );
};

const FormButtonsGroup = ({ children }: { children: ReactNode }) => {
  return (
    <Group
      p="md"
      px="lg"
      spacing="md"
      bg="white"
      className="form-buttons-group"
    >
      {children}
    </Group>
  );
};

type FormButtonsProps = {
  targetId: number | null;
  targetModel: CacheableModel;
  shouldAllowInvalidation: boolean;
  targetName?: string;
};

const FormButtons = ({
  targetId,
  targetModel,
  shouldAllowInvalidation,
  targetName,
}: FormButtonsProps) => {
  const { dirty } = useFormikContext<Strategy>();

  if (targetId === rootId) {
    shouldAllowInvalidation = false;
  }

  const { isFormPending, wasFormRecentlyPending } = useIsFormPending();

  const isSavingPossible = dirty || isFormPending || wasFormRecentlyPending;

  if (isSavingPossible) {
    return (
      <FormButtonsGroup>
        <SaveAndDiscardButtons dirty={dirty} isFormPending={isFormPending} />
      </FormButtonsGroup>
    );
  }

  if (shouldAllowInvalidation && targetId && targetName) {
    return (
      <FormButtonsGroup>
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
      verb={t`Invalidate`}
      timezone={timezone}
    />
  );
};

const SaveAndDiscardButtons = ({
  dirty,
  isFormPending,
}: {
  dirty: boolean;
  isFormPending: boolean;
}) => {
  return (
    <>
      <Button
        disabled={!dirty || isFormPending}
        type="reset"
      >{t`Discard changes`}</Button>
      <FormSubmitButton
        miw="10rem"
        h="40px"
        label={t`Save changes`}
        successLabel={
          <Group spacing="xs">
            <Icon name="check" /> {t`Saved`}
          </Group>
        }
        activeLabel={<LoaderInButton size="1rem" />}
        variant="filled"
        data-testid="strategy-form-submit-button"
      />
    </>
  );
};

const StrategySelector = ({
  targetId,
  model,
}: {
  targetId: number | null;
  model?: CacheableModel;
}) => {
  const { values } = useFormikContext<Strategy>();

  const availableStrategies = useMemo(() => {
    return targetId === rootId ? _.omit(Strategies, "inherit") : Strategies;
  }, [targetId]);

  return (
    <section>
      <FormRadioGroup
        label={
          <Text
            lh="1rem"
            color="text-medium"
          >{t`When should cached query results be invalidated?`}</Text>
        }
        name="type"
      >
        <Stack mt="md" spacing="md">
          {_.map(availableStrategies, (option, name) => {
            const optionLabelParts = getLabelString(option.label, model).split(
              ":",
            );
            const optionLabelFormatted = (
              <>
                <strong>{optionLabelParts[0]}</strong>
                {optionLabelParts[1] ? <>: {optionLabelParts[1]}</> : null}
              </>
            );
            return (
              <Radio
                value={name}
                key={name}
                label={optionLabelFormatted}
                autoFocus={values.type === name}
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
  strategyType: StrategyType;
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

const getDefaultValueForField = (
  strategyType: StrategyType,
  fieldName?: string,
) => {
  return fieldName
    ? Strategies[strategyType].validateWith.cast({})[fieldName]
    : "";
};

const MultiplierFieldSubtitle = () => (
  <div>
    {t`To determine how long each cached result should stick around, we take that query's average execution time and multiply that by what you input here. The result is how many seconds the cache should remain valid for.`}{" "}
    <Tooltip
      events={{
        hover: true,
        focus: true,
        touch: true,
      }}
      inline={true}
      styles={{
        tooltip: {
          whiteSpace: "normal",
        },
      }}
      label={t`If a query takes on average 120 seconds (2 minutes) to run, and you input 10 for your multiplier, its cache entry will persist for 1,200 seconds (20 minutes).`}
      maw="20rem"
    >
      <Text tabIndex={0} lh="1" display="inline" c="brand">
        {t`Example`}
      </Text>
    </Tooltip>
  </div>
);
