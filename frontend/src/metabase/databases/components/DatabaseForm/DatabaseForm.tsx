import React, { useCallback, useMemo, useState } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormFooter from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { Engine } from "metabase-types/api";
import { DatabaseValues } from "../../types";
import { getValidationSchema, getVisibleFields } from "../../utils/schema";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";
import DatabaseDetailField from "../DatabaseDetailField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { LinkButton, LinkFooter } from "./DatabaseForm.styled";

export interface DatabaseFormProps {
  engines: Record<string, Engine>;
  initialValues?: DatabaseValues;
  isHosted?: boolean;
  isAdvanced?: boolean;
  onSubmit: (values: DatabaseValues) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
}

const DatabaseForm = ({
  engines,
  initialValues: initialData,
  isHosted = false,
  isAdvanced = false,
  onSubmit,
  onCancel,
  onEngineChange,
}: DatabaseFormProps): JSX.Element => {
  const [engineKey, setEngineKey] = useState(initialData?.engine);
  const engine = engineKey ? engines[engineKey] : undefined;

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineKey, isAdvanced);
  }, [engine, engineKey, isAdvanced]);

  const initialValues = useMemo(() => {
    return initialData
      ? validationSchema.cast(initialData, { stripUnknown: true })
      : validationSchema.getDefault();
  }, [initialData, validationSchema]);

  const handleEngineChange = useCallback(
    (engineKey: string | undefined) => {
      setEngineKey(engineKey);
      onEngineChange?.(engineKey);
    },
    [onEngineChange],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      <DatabaseFormBody
        engine={engine}
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onEngineChange={handleEngineChange}
        onCancel={onCancel}
      />
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isHosted: boolean;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  onCancel?: () => void;
}

const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  isHosted,
  isAdvanced,
  onEngineChange,
  onCancel,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty } = useFormikContext<DatabaseValues>();

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Form disabled={isAdvanced && !dirty}>
      <DatabaseEngineField
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onChange={onEngineChange}
      />
      {!isAdvanced && (
        <DatabaseEngineWarning
          engineKey={engineKey}
          engines={engines}
          onChange={onEngineChange}
        />
      )}
      {engine && <DatabaseNameField engine={engine} />}
      {fields.map(field => (
        <DatabaseDetailField key={field.name} field={field} />
      ))}
      <DatabaseFormFooter isAdvanced={isAdvanced} onCancel={onCancel} />
    </Form>
  );
};

interface DatabaseFormFooterProps {
  isAdvanced: boolean;
  onCancel?: () => void;
}

const DatabaseFormFooter = ({
  isAdvanced,
  onCancel,
}: DatabaseFormFooterProps) => {
  const { values, dirty } = useFormikContext<DatabaseValues>();

  if (isAdvanced) {
    return (
      <div>
        <FormSubmitButton title={t`Save`} disabled={!dirty} primary />
        <FormErrorMessage />
      </div>
    );
  } else if (values.engine) {
    return (
      <FormFooter>
        <FormErrorMessage inline />
        <Button type="button" onClick={onCancel}>{t`Skip`}</Button>
        <FormSubmitButton title={t`Connect database`} primary />
      </FormFooter>
    );
  } else {
    return (
      <LinkFooter>
        <LinkButton type="button" onClick={onCancel}>
          {t`I'll add my data later`}
        </LinkButton>
      </LinkFooter>
    );
  }
};

export default DatabaseForm;
