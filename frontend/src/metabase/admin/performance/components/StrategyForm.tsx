import styled from "@emotion/styled";
import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingSelect } from "metabase/admin/settings/components/widgets/SettingSelect";
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
import {
  Button,
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
  ScheduleSettings,
  ScheduleStrategy,
  Strategy,
  StrategyType,
} from "metabase-types/api";
import { DurationUnit } from "metabase-types/api";

import { useRecentlyTrue } from "../hooks/useRecentlyTrue";
import { rootId, Strategies, strategyValidationSchema } from "../strategies";
import { cronToScheduleSettings, scheduleSettingsToCron } from "../utils";

export const StrategyForm = ({
  targetId,
  setIsDirty,
  saveStrategy,
  savedStrategy,
}: {
  targetId: number | null;
  setIsDirty: (isDirty: boolean) => void;
  saveStrategy: (values: Strategy) => Promise<void>;
  savedStrategy?: Strategy;
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
      enableReinitialize
    >
      <StrategyFormBody targetId={targetId} setIsDirty={setIsDirty} />
    </FormProvider>
  );
};

export const StyledSettingSelect = styled(SettingSelect)`
  width: 125px;
  margin-top: 12px;
`;

const StrategyFormBody = ({
  targetId,
  setIsDirty,
}: {
  targetId: number | null;
  setIsDirty: (isDirty: boolean) => void;
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
    <Form
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Stack p="lg" spacing="xl" maw="27.5rem">
        <StrategySelector targetId={targetId} />
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
              title={t`Cache time-to-live (TTL) multiplier`}
              subtitle={<MultiplierFieldSubtitle />}
            >
              <PositiveNumberInput strategyType="ttl" name="multiplier" />
            </Field>
          </>
        )}
        {selectedStrategyType === "duration" && (
          <>
            <Field title={t`Cache results for this many hours`}>
              <PositiveNumberInput strategyType="duration" name="duration" />
            </Field>
            <input type="hidden" name="unit" />
          </>
        )}
        {selectedStrategyType === "schedule" && <ScheduleStrategyFormFields />}
      </Stack>
      <FormButtons />
    </Form>
  );
};

const ScheduleStrategyFormFields = () => {
  const { values, setFieldValue } = useFormikContext<ScheduleStrategy>();
  const initialSchedule = cronToScheduleSettings(values.schedule);
  const [schedule, setSchedule] = useState<ScheduleSettings>(
    initialSchedule || {},
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
    return <LoadingAndErrorWrapper error="Error: Cannot interpret schedule" />;
  }
  return (
    <Schedule
      schedule={schedule}
      scheduleOptions={["hourly", "daily", "weekly", "monthly"]}
      onScheduleChange={onScheduleChange}
      textBeforeInterval={t`Invalidate`}
    />
  );
};

export const FormButtons = () => {
  const { dirty } = useFormikContext<Strategy>();
  const { status } = useFormContext();

  const isFormPending = status === "pending";
  const [wasFormRecentlyPending] = useRecentlyTrue(isFormPending, 500);

  const shouldShowButtons = dirty || isFormPending || wasFormRecentlyPending;

  if (!shouldShowButtons) {
    return null;
  }

  return (
    <Group
      style={{
        position: "sticky",
        bottom: 0,
        borderTop: `1px solid ${color("border")}`,
      }}
      p="1rem"
      bg={color("white")}
      spacing="md"
    >
      <Button
        disabled={!dirty || isFormPending}
        type="reset"
      >{t`Discard changes`}</Button>
      <FormSubmitButton
        miw="10rem"
        label={t`Save changes`}
        successLabel={
          <Group spacing="xs">
            <Icon name="check" /> {t`Saved`}
          </Group>
        }
        activeLabel={<Loader size="xs" />}
        variant="filled"
        data-testid="strategy-form-submit-button"
      />
    </Group>
  );
};

const StrategySelector = ({ targetId }: { targetId: number | null }) => {
  const { values } = useFormikContext<Strategy>();

  const availableStrategies = useMemo(() => {
    return targetId === rootId ? _.omit(Strategies, "inherit") : Strategies;
  }, [targetId]);

  return (
    <section>
      <FormRadioGroup
        label={
          <Text lh="1rem">{t`When should cached query results be invalidated?`}</Text>
        }
        name="type"
      >
        <Stack mt="md" spacing="md">
          {_.map(availableStrategies, (option, name) => {
            const optionLabelParts = option.label.split(":");
            const optionLabelFormatted =
              optionLabelParts.length === 1 ? (
                option.label
              ) : (
                <>
                  <strong>{optionLabelParts[0]}</strong>:{optionLabelParts[1]}
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
) =>
  fieldName ? Strategies[strategyType].validateWith.cast({})[fieldName] : "";

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
        Example
      </Text>
    </Tooltip>
  </div>
);
