import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

// BUG: Errors are not displayed on the submit button when the input is invalid
// To trigger an error, enter '1e5'
//
// BUG: When you put invalid input in, it resets to the default

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
} from "metabase/ui";

import { rootId } from "../constants";
import { useRecentlyTrue } from "../hooks/useRecentlyTrue";
import type { Strat, StrategyType } from "../types";
import { Strategies } from "../types";
import { strategyValidationSchema } from "../validation";

export const StrategyForm = ({
  targetId,
  setIsDirty,
  saveStrategy,
  savedStrategy,
}: {
  targetId: number | null;
  setIsDirty: (isDirty: boolean) => void;
  saveStrategy: (values: Strat) => void;
  savedStrategy?: Strat;
}) => {
  return (
    <FormProvider<Strat>
      key={targetId}
      initialValues={savedStrategy ?? { type: "inherit" }}
      validationSchema={strategyValidationSchema}
      onSubmit={saveStrategy}
      enableReinitialize={true}
    >
      <StrategyFormBody targetId={targetId} setIsDirty={setIsDirty} />
    </FormProvider>
  );
};

const StrategyFormBody = ({
  targetId,
  setIsDirty,
}: {
  targetId: number | null;
  setIsDirty: (isDirty: boolean) => void;
}) => {
  const { dirty, values, setFieldValue } = useFormikContext<Strat>();

  const selectedStrategyType = values.type;

  useEffect(() => {
    setIsDirty(dirty);
  }, [dirty, setIsDirty]);

  useEffect(() => {
    if (selectedStrategyType === "duration") {
      setFieldValue("unit", "hours");
    }
  }, [selectedStrategyType, setFieldValue]);

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
              <PositiveNumberInput fieldName="min_duration" />
            </Field>
            {/* TODO: Add link to example */}
            <Field
              title={t`Cache time-to-live (TTL) multiplier`}
              subtitle={t`To determine how long each cached result should stick around, we take that query's average execution time and multiply that by what you input here. The result is how many seconds the cache should remain valid for.`}
            >
              <PositiveNumberInput fieldName="multiplier" />
            </Field>
          </>
        )}
        {selectedStrategyType === "duration" && (
          <>
            <Field title={t`Cache result for this many hours`}>
              <PositiveNumberInput
                fieldName="duration"
                placeholder={getDefaultValueForField("duration", "duration")}
              />
              {/* TODO: remove this? */}
            </Field>
            <input type="hidden" name="unit" />
          </>
        )}
        {/*
              {selectedStrategy === "schedule" && (
                  <section>
                    <Title order={3}>{t`Schedule`}</Title>
                    <p>{t`(explanation goes here)`}</p>
                    <CronInput
                      initialValue={savedStrategy.schedule}
                    />
                  </section>
              )}
                */}
      </Stack>
      <FormButtons />
    </Form>
  );
};

export const FormButtons = () => {
  const { dirty } = useFormikContext<Strat>();
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
        label={t`Save changes`}
        successLabel={
          <Group spacing="xs">
            <Icon name="check" /> {t`Saved`}
          </Group>
        }
        activeLabel={
          <Group spacing="sm">
            <Loader size="xs" />
            {t`Saving...`}
          </Group>
        }
        variant="filled"
      />
    </Group>
  );
};

const StrategySelector = ({ targetId }: { targetId: number | null }) => {
  const { values } = useFormikContext<Strat>();

  const availableStrategies =
    targetId === rootId ? _.omit(Strategies, "inherit") : Strategies;

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
            // HACK: This approach assumes the translation separates the strategy's name and description with ':'
            const optionLabelFormatted =
              optionLabelParts.length === 1 ? (
                option.label
              ) : (
                <>
                  <strong>{option.label.split(":")[0]}</strong>:
                  {option.label.split(":")[1]}
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
  fieldName,
  ...props
}: { fieldName: string } & Partial<FormTextInputProps>) => {
  // NOTE: Known bug: on Firefox, if you type invalid input, the error
  // message will be "Required field" instead of "must be a positive number".
  // BUG: if you blank out the input and press save, there is no user feedback
  return (
    <FormTextInput
      type="number"
      min={1}
      styles={{
        input: {
          // This is like `text-align: right` but it's RTL-friendly
          textAlign: "end",
          maxWidth: "3.5rem",
        },
      }}
      autoComplete="off"
      {...props}
      name={fieldName}
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
  fieldName: string,
) => Strategies[strategyType].validateWith.cast({})[fieldName];
