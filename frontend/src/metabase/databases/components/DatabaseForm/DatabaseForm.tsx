import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { FormFooter } from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { Flex } from "metabase/ui";
import type { DatabaseData, Engine } from "metabase-types/api";

import { getEngines, getIsHosted } from "../../selectors";
import { getDefaultEngineKey } from "../../utils/engine";
import {
  getSubmitValues,
  getValidationSchema,
  getVisibleFields,
} from "../../utils/schema";
import DatabaseDetailField from "../DatabaseDetailField";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import DatabaseNameField from "../DatabaseNameField";

import { LinkButton, LinkFooter } from "./DatabaseForm.styled";

interface DatabaseFormProps {
  initialValues?: DatabaseData;
  autofocusFieldName?: string;
  isAdvanced?: boolean;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  setIsDirty?: (isDirty: boolean) => void;
}

export const DatabaseForm = ({
  initialValues: initialData,
  autofocusFieldName,
  isAdvanced = false,
  onSubmit,
  onCancel,
  onEngineChange,
  setIsDirty,
}: DatabaseFormProps): JSX.Element => {
  const engines = useSelector(getEngines);
  const isHosted = useSelector(getIsHosted);
  const initialEngineKey = getEngineKey(engines, initialData, isAdvanced);
  const [engineKey, setEngineKey] = useState(initialEngineKey);
  const engine = getEngine(engines, engineKey);

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineKey, isAdvanced);
  }, [engine, engineKey, isAdvanced]);

  const initialValues = useMemo(() => {
    return validationSchema.cast(
      { ...initialData, engine: engineKey },
      { stripUnknown: true },
    );
  }, [initialData, engineKey, validationSchema]);

  const handleSubmit = useCallback(
    (values: DatabaseData) => {
      return onSubmit?.(getSubmitValues(engine, values, isAdvanced));
    },
    [engine, isAdvanced, onSubmit],
  );

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
      onSubmit={handleSubmit}
    >
      <DatabaseFormBody
        engine={engine}
        engineKey={engineKey}
        engines={engines}
        autofocusFieldName={autofocusFieldName}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onEngineChange={handleEngineChange}
        onCancel={onCancel}
        setIsDirty={setIsDirty}
      />
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  autofocusFieldName?: string;
  isHosted: boolean;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  setIsDirty?: (isDirty: boolean) => void;
}

const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  autofocusFieldName,
  isHosted,
  isAdvanced,
  onEngineChange,
  onCancel,
  setIsDirty,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty } = useFormikContext<DatabaseData>();

  useEffect(() => {
    setIsDirty?.(dirty);
  }, [dirty, setIsDirty]);

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Form data-testid="database-form">
      <DatabaseEngineField
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onChange={onEngineChange}
      />
      <DatabaseEngineWarning
        engineKey={engineKey}
        engines={engines}
        onChange={onEngineChange}
      />
      {engine && <DatabaseNameField engine={engine} />}
      {fields.map(field => (
        <DatabaseDetailField
          key={field.name}
          field={field}
          autoFocus={field.name === autofocusFieldName}
          data-kek={field.name}
        />
      ))}
      <DatabaseFormFooter
        isDirty={dirty}
        isAdvanced={isAdvanced}
        onCancel={onCancel}
      />
    </Form>
  );
};

interface DatabaseFormFooterProps {
  isAdvanced: boolean;
  isDirty: boolean;
  onCancel?: () => void;
}

const DatabaseFormFooter = ({
  isAdvanced,
  isDirty,
  onCancel,
}: DatabaseFormFooterProps) => {
  const { values } = useFormikContext<DatabaseData>();
  const isNew = values.id == null;

  // eslint-disable-next-line no-unconditional-metabase-links-render -- Metabase setup + admin pages only
  const { url: docsUrl } = useDocsUrl("databases/connecting");

  if (isAdvanced) {
    return (
      <FormFooter data-testid="form-footer">
        <FormErrorMessage />
        <Flex justify="space-between" align="center" w="100%">
          {isNew ? (
            <ExternalLink
              key="link"
              href={docsUrl}
              style={{ fontWeight: 500, fontSize: ".875rem" }}
            >
              {t`Need help connecting?`}
            </ExternalLink>
          ) : (
            <div />
          )}

          <Flex gap="sm">
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              disabled={!isDirty}
              title={isNew ? t`Save` : t`Save changes`}
              primary
            />
          </Flex>
        </Flex>
      </FormFooter>
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

const getEngine = (engines: Record<string, Engine>, engineKey?: string) => {
  return engineKey ? engines[engineKey] : undefined;
};

const getEngineKey = (
  engines: Record<string, Engine>,
  values?: DatabaseData,
  isAdvanced?: boolean,
) => {
  if (values?.engine) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};
