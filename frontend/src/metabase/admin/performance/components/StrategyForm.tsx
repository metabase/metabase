import cx from "classnames";
import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Schedule } from "metabase/common/components/Schedule/Schedule";
import { cronToScheduleSettings } from "metabase/common/components/Schedule/cron";
import type { FormTextInputProps } from "metabase/forms";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
  useFormContext,
} from "metabase/forms";
import { PLUGIN_CACHING } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Loader,
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
  DurationStrategy,
  ScheduleStrategy,
} from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";

import { strategyValidationSchema } from "../constants/complex";
import { defaultCronSchedule, rootId } from "../constants/simple";
import { useIsFormPending } from "../hooks/useIsFormPending";
import { isModelWithClearableCache } from "../types";
import { getDefaultValueForField, getLabelString } from "../utils";

import Styles from "./PerformanceApp.module.css";

interface ButtonLabels {
  save: string;
  discard: string;
}

/**
 * Layout variant of the form's footer + wrapper styling.
 *
 * - `"default"` (full page): scrolling `FormBox` with bordered Save/Discard
 *   bar; `InvalidateNowButton` appears alone when the form is clean.
 * - `"sidebar"`: right-aligned Save/Cancel without the bordered bar; no
 *   `FormBox` padding override (handled by the sidebar surface itself).
 * - `"modal"`: drops the `FormBox` padding so the modal's own inset wins,
 *   and always renders Invalidate + Cancel + Save in one row.
 */
export type StrategyFormLayout = "default" | "sidebar" | "modal";

/** Module-level, frozen so the form's initialValues reference is stable
 * across renders. The targetId picks one of the two when no saved strategy
 * is set yet. */
const ROOT_DEFAULT_STRATEGY: CacheStrategy = { type: "nocache" };
const INHERIT_DEFAULT_STRATEGY: CacheStrategy = { type: "inherit" };

interface StrategyFormProps {
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
  layout?: StrategyFormLayout;
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
  layout = "default",
  buttonLabels = layout === "default"
    ? {
        save: t`Save changes`,
        discard: t`Discard changes`,
      }
    : {
        save: t`Save`,
        discard: t`Cancel`,
      },
}: StrategyFormProps) => {
  const defaultStrategy =
    targetId === rootId ? ROOT_DEFAULT_STRATEGY : INHERIT_DEFAULT_STRATEGY;

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
        layout={layout}
        strategyType={initialValues.type}
      />
    </FormProvider>
  );
};

/** Don't count the addition/deletion of a default value as a reason to consider the form dirty */
const isFormDirty = (values: CacheStrategy, initialValues: CacheStrategy) => {
  const fieldNames = [...Object.keys(values), ...Object.keys(initialValues)];
  const defaultValues = Object.fromEntries(
    fieldNames.map((fieldName) => [
      fieldName,
      getDefaultValueForField(values.type, fieldName),
    ]),
  );
  const initialValuesWithDefaults = { ...defaultValues, ...initialValues };
  const valuesWithDefaults = { ...defaultValues, ...values };
  // If the default value is a number and the value is a string, coerce the value to a number
  const coercedValuesWithDefaults = Object.fromEntries(
    Object.entries(valuesWithDefaults).map(([key, value]) => [
      key,
      typeof getDefaultValueForField(values.type, key) === "number" &&
      typeof value === "string"
        ? Number(value)
        : value,
    ]),
  );
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
  layout,
}: {
  targetId: number | null;
  targetModel: CacheableModel;
  targetName: string;
  strategyType: CacheStrategyType;
  setIsDirty: (isDirty: boolean) => void;
  shouldAllowInvalidation: boolean;
  shouldShowName?: boolean;
  buttonLabels: ButtonLabels;
  layout: StrategyFormLayout;
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

  const handleSwitchToggle = useCallback(() => {
    if (values.type === "duration" || values.type === "schedule") {
      const newValue = !(values as DurationStrategy | ScheduleStrategy)
        .refresh_automatically;
      setFieldValue("refresh_automatically", newValue);
      setStatus("idle");
    }
  }, [values, setFieldValue, setStatus]);

  return (
    <Flex direction="column" h={layout === "modal" ? undefined : "100%"}>
      <Form
        display="flex"
        style={{
          overflow: layout === "default" ? "auto" : undefined,
          flexDirection: "column",
          // In the modal layout the Modal sizes itself, so the form shouldn't
          // claim flex-grow on its parent.
          flexGrow: layout === "modal" ? undefined : 1,
        }}
        aria-labelledby={headingId}
        data-testid={`strategy-form-for-${targetModel}-${targetId}`}
      >
        <Box
          className={cx({
            [Styles.FormBox]: layout !== "modal",
            [Styles.FormBoxSidebar]: layout === "sidebar",
          })}
        >
          {shouldShowName && (
            <Box lh="1rem" pt="md" c="text-secondary">
              <Group gap="sm">
                {targetModel === "database" && (
                  <FixedSizeIcon name="database" c="inherit" />
                )}
                <Text fw="bold" py="1rem">
                  {targetName}
                </Text>
              </Group>
            </Box>
          )}
          <Stack maw="35rem" pt={targetId === rootId ? "xl" : 0} gap="xl">
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
                {["question", "dashboard"].includes(targetModel) && (
                  <PLUGIN_CACHING.PreemptiveCachingSwitch
                    handleSwitchToggle={handleSwitchToggle}
                  />
                )}
              </>
            )}
            {selectedStrategyType === "schedule" && (
              <>
                <ScheduleStrategyFormFields />
                {["question", "dashboard"].includes(targetModel) && (
                  <PLUGIN_CACHING.PreemptiveCachingSwitch
                    handleSwitchToggle={handleSwitchToggle}
                  />
                )}
              </>
            )}
          </Stack>
        </Box>
        <FormButtons
          targetId={targetId}
          targetModel={targetModel}
          targetName={targetName}
          shouldAllowInvalidation={shouldAllowInvalidation}
          buttonLabels={buttonLabels}
          layout={layout}
          dirty={dirty}
        />
      </Form>
    </Flex>
  );
};

const FormButtonsGroup = ({
  children,
  layout,
}: {
  children: ReactNode;
  layout: StrategyFormLayout;
}) => {
  return (
    <Group
      py="md"
      gap="md"
      justify={layout === "sidebar" ? "flex-end" : undefined}
      px={layout === "sidebar" ? "md" : "2.5rem"}
      pb={layout === "sidebar" ? 0 : undefined}
      bg={layout === "sidebar" ? undefined : "background-primary"}
      style={
        layout === "sidebar"
          ? undefined
          : { borderTop: "1px solid var(--mb-color-border)" }
      }
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
  buttonLabels: ButtonLabels;
  layout: StrategyFormLayout;
  dirty: boolean;
};

const FormButtons = ({
  targetId,
  targetModel,
  shouldAllowInvalidation,
  targetName,
  buttonLabels,
  layout,
  dirty,
}: FormButtonsProps) => {
  if (targetId === rootId) {
    shouldAllowInvalidation = false;
  }

  const canInvalidate =
    shouldAllowInvalidation &&
    isModelWithClearableCache(targetModel) &&
    targetId !== null &&
    !!targetName;

  const { isFormPending, wasFormRecentlyPending } = useIsFormPending();

  if (layout === "modal") {
    return (
      <Group
        justify={canInvalidate ? "space-between" : "flex-end"}
        wrap="nowrap"
        mt="xl"
        gap="md"
      >
        {canInvalidate && (
          <PLUGIN_CACHING.InvalidateNowButton
            targetId={targetId}
            targetModel={targetModel}
            targetName={targetName}
          />
        )}
        <Group gap="md" wrap="nowrap">
          <Button type="reset">{buttonLabels.discard}</Button>
          <FormSubmitButton
            h="2.5rem"
            label={buttonLabels.save}
            variant="filled"
            data-testid="strategy-form-submit-button"
          />
        </Group>
      </Group>
    );
  }

  const isSavingPossible = dirty || isFormPending || wasFormRecentlyPending;

  if (isSavingPossible) {
    return (
      <FormButtonsGroup layout={layout}>
        <SaveAndDiscardButtons
          dirty={dirty}
          isFormPending={isFormPending}
          buttonLabels={buttonLabels}
          layout={layout}
        />
      </FormButtonsGroup>
    );
  }

  if (canInvalidate) {
    return (
      <FormButtonsGroup layout={layout}>
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
  const timezone = useSelector((state) =>
    getSetting(state, "report-timezone-short"),
  );
  const onScheduleChange = useCallback(
    (newCronSchedule: string) => {
      setFieldValue("schedule", newCronSchedule);
    },
    [setFieldValue],
  );
  if (!initialSchedule) {
    return (
      <LoadingAndErrorWrapper
        error={t`Error: Cannot interpret schedule: ${scheduleInCronFormat}`}
      />
    );
  }

  return (
    <>
      <Schedule
        cronString={scheduleInCronFormat || defaultCronSchedule}
        scheduleOptions={["hourly", "daily", "weekly", "monthly"]}
        onScheduleChange={onScheduleChange}
        verb={c("A verb in the imperative mood").t`Invalidate`}
        timezone={timezone}
        aria-label={t`Describe how often the cache should be invalidated`}
      />
    </>
  );
};

const SaveAndDiscardButtons = ({
  dirty,
  isFormPending,
  buttonLabels,
  layout,
}: {
  dirty: boolean;
  isFormPending: boolean;
  buttonLabels: ButtonLabels;
  layout: StrategyFormLayout;
}) => {
  return (
    <>
      <Button disabled={!dirty || isFormPending} type="reset">
        {buttonLabels.discard}
      </Button>
      <FormSubmitButton
        miw={layout === "sidebar" ? undefined : "10rem"}
        h="2.5rem"
        label={buttonLabels.save}
        successLabel={
          <Group gap="xs">
            <Icon name="check" /> {t`Saved`}
          </Group>
        }
        activeLabel={<Loader size="1rem" pos="relative" top={1} />}
        variant="filled"
        data-testid="strategy-form-submit-button"
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
          <Stack gap="xs">
            <Text lh="1.5rem" fw="bold" fz="md" id={headingId}>
              {t`Select the cache invalidation policy`}
            </Text>
            <Text lh="1rem" fw="normal" size="sm" c="text-secondary">
              {t`This determines how long cached results will be stored.`}
            </Text>
          </Stack>
        }
        name="type"
      >
        <Stack mt="xl" gap="md">
          {Object.entries(availableStrategies).map(([name, option]) => (
            <Radio
              key={name}
              value={name}
              label={<strong>{getLabelString(option.label, model)}</strong>}
              description={
                option.description
                  ? getLabelString(option.description, model)
                  : undefined
              }
              autoFocus={values.type === name}
              role="radio"
            />
          ))}
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
      <Stack gap="xs">
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
