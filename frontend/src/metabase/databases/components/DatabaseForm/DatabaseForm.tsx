import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { FormFooter } from "metabase/common/components/FormFooter";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { Form, FormProvider } from "metabase/forms";
import { FormErrorMessage } from "metabase/forms/components/FormErrorMessage";
import { FormSubmitButton } from "metabase/forms/components/FormSubmitButton";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Text } from "metabase/ui";
import type { DatabaseData, Engine, EngineKey } from "metabase-types/api";

import { getEngines } from "../../selectors";
import { getDefaultEngineKey } from "../../utils/engine";
import {
  getSubmitValues,
  getValidationSchema,
  getVisibleFields,
} from "../../utils/schema";
import { DatabaseConnectionStringField } from "../DatabaseConnectionUri";
import DatabaseDetailField from "../DatabaseDetailField";
import { DatabaseEngineField } from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { DatabaseNameField } from "../DatabaseNameField";

export type EngineFieldState = "default" | "hidden" | "disabled";

export interface DatabaseFormConfig {
  /** present the form with advanced configuration options */
  isAdvanced?: boolean;
  engine?: {
    /** present the engine field as normal, disabled, or hidden */
    fieldState?: EngineFieldState | undefined;
  };
  name?: {
    /** present the name field as a slug */
    isSlug?: boolean;
  };
}

type ContinueWithoutDataComponent = (props: {
  onCancel?: () => void;
}) => JSX.Element;

interface DatabaseFormProps {
  initialValues?: Partial<DatabaseData>;
  autofocusFieldName?: string;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  setIsDirty?: (isDirty: boolean) => void;
  config?: DatabaseFormConfig;
  location: "admin" | "setup" | "embedding_setup";
  /**
   * Whether to show the sample database indicator in the engine list and change the "I'll add my data later" button to "Continue with sample data"
   */
  showSampleDatabase?: boolean;
  /** Slot to replace the button to continue without data/with only sample data */
  ContinueWithoutDataSlot?: ContinueWithoutDataComponent;
}

export const DatabaseForm = ({
  initialValues: initialData,
  autofocusFieldName,
  onSubmit,
  onCancel,
  onEngineChange,
  setIsDirty,
  location,
  showSampleDatabase = false,
  ContinueWithoutDataSlot,
  config = {},
}: DatabaseFormProps): JSX.Element => {
  const isAdvanced = config.isAdvanced || false;
  const engineFieldState = config.engine?.fieldState;

  const engines = useSelector(getEngines);
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
        // casting won't be needed after migrating all usages of engineKey
        engineKey={engineKey as EngineKey}
        engines={engines}
        engineFieldState={engineFieldState}
        autofocusFieldName={autofocusFieldName}
        isAdvanced={isAdvanced}
        onEngineChange={handleEngineChange}
        onCancel={onCancel}
        setIsDirty={setIsDirty}
        config={config}
        showSampleDatabase={showSampleDatabase}
        ContinueWithoutDataSlot={ContinueWithoutDataSlot}
        location={location}
      />
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: EngineKey | undefined;
  engines: Record<string, Engine>;
  engineFieldState?: "default" | "hidden" | "disabled";
  autofocusFieldName?: string;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  setIsDirty?: (isDirty: boolean) => void;
  config: DatabaseFormConfig;
  showSampleDatabase?: boolean;
  ContinueWithoutDataSlot?: ContinueWithoutDataComponent;
  location: "admin" | "setup" | "embedding_setup";
}

const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  engineFieldState = "default",
  autofocusFieldName,
  isAdvanced,
  onEngineChange,
  onCancel,
  setIsDirty,
  config,
  showSampleDatabase = false,
  ContinueWithoutDataSlot,
  location,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty, setValues } = useFormikContext<DatabaseData>();

  useEffect(() => {
    setIsDirty?.(dirty);
  }, [dirty, setIsDirty]);

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Form data-testid="database-form" className="database-form">
      {engineFieldState !== "hidden" && (
        <>
          <DatabaseEngineField
            engineKey={engineKey}
            engines={engines}
            isAdvanced={isAdvanced}
            onChange={onEngineChange}
            disabled={engineFieldState === "disabled"}
            showSampleDatabase={showSampleDatabase}
          />
          <DatabaseEngineWarning
            engineKey={engineKey}
            engines={engines}
            onChange={onEngineChange}
          />
        </>
      )}
      <DatabaseConnectionStringField
        engineKey={engineKey}
        location={location}
        setValues={setValues}
      />
      {engine && (
        <DatabaseNameField
          engine={engine}
          config={config}
          autoFocus={autofocusFieldName === "name"}
        />
      )}
      {fields.map((field) => (
        <DatabaseDetailField
          key={field.name}
          field={field}
          autoFocus={autofocusFieldName === field.name}
          data-kek={field.name}
          engineKey={engineKey}
        />
      ))}
      <DatabaseFormFooter
        isDirty={dirty}
        isAdvanced={isAdvanced}
        onCancel={onCancel}
        showSampleDatabase={showSampleDatabase}
        ContinueWithoutDataSlot={ContinueWithoutDataSlot}
      />
    </Form>
  );
};

interface DatabaseFormFooterProps {
  isAdvanced: boolean;
  isDirty: boolean;
  onCancel?: () => void;
  showSampleDatabase?: boolean;
  ContinueWithoutDataSlot?: ContinueWithoutDataComponent;
}

const DatabaseFormFooter = ({
  isAdvanced,
  isDirty,
  onCancel,
  showSampleDatabase,
  ContinueWithoutDataSlot,
}: DatabaseFormFooterProps) => {
  const { values } = useFormikContext<DatabaseData>();
  const isNew = values.id == null;

  // eslint-disable-next-line no-unconditional-metabase-links-render -- Metabase setup + admin pages only
  const { url: docsUrl } = useDocsUrl("databases/connecting");

  const hasSampleDatabase = useSetting("has-sample-database?");

  const className = "database-form-footer";

  if (isAdvanced) {
    return (
      <FormFooter data-testid="form-footer" className={className}>
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
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              disabled={!isDirty}
              variant="filled"
              label={isNew ? t`Save` : t`Save changes`}
            />
          </Flex>
        </Flex>
      </FormFooter>
    );
  }

  if (values.engine) {
    return (
      <FormFooter className={className}>
        <FormErrorMessage inline />
        <Button onClick={onCancel}>{t`Skip`}</Button>
        <FormSubmitButton variant="filled" label={t`Connect database`} />
      </FormFooter>
    );
  }

  if (ContinueWithoutDataSlot) {
    return <ContinueWithoutDataSlot onCancel={onCancel} />;
  }

  // This check happens only during setup where we cannot fetch databases.
  // Unless someone explicitly set the environment variable MB_LOAD_SAMPLE_CONTENT
  // to false, we can assume that the instance loads with the Sample Database.
  // https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_load_sample_content
  if (hasSampleDatabase !== false && showSampleDatabase) {
    return (
      <>
        <Button variant="filled" mb="md" mt="lg" onClick={onCancel}>
          {t`Continue with sample data`}
        </Button>
        <Text fz="sm">
          {c("{0} is 'Sample Database'").jt`Use our ${(
            <strong key="sample">{t`Sample Database`}</strong>
          )} to explore and test the app.`}
        </Text>
        <Text fz="sm">{t`Add your own data at any time.`}</Text>
      </>
    );
  }

  return (
    <Button variant="filled" mt="lg" onClick={onCancel}>
      {t`I'll add my data later`}
    </Button>
  );
};

const getEngine = (engines: Record<string, Engine>, engineKey?: string) => {
  return engineKey ? engines[engineKey] : undefined;
};

const getEngineKey = (
  engines: Record<string, Engine>,
  values?: Partial<DatabaseData>,
  isAdvanced?: boolean,
) => {
  if (values?.engine && Object.keys(engines).includes(values.engine)) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};
