import React, { useEffect } from "react";
import { t } from "ttag";
import Databases from "metabase/entities/databases";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { StepDescription } from "./DatabaseStep.styled";
import { FormProps } from "./types";
import { DatabaseInfo } from "../../types";

interface Props {
  database?: DatabaseInfo;
  engine?: string;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onEngineChange: (engine: string) => void;
  onStepSelect: () => void;
  onStepSubmit: (database: DatabaseInfo) => void;
  onStepCancel: (engine?: string) => void;
}

const DatabaseStep = ({
  database,
  engine,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onEngineChange,
  onStepSelect,
  onStepSubmit,
  onStepCancel,
}: Props) => {
  useEffect(() => {
    engine && onEngineChange(engine);
  }, [engine, onEngineChange]);

  const handleCancel = () => {
    onStepCancel(engine);
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, isStepCompleted)}
        label={3}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={onStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(database, isStepCompleted)} label={3}>
      <StepDescription>
        <div>{t`Are you ready to start exploring your data? Add it below.`}</div>
        <div>{t`Not ready? Skip and play around with our Sample Dataset.`}</div>
      </StepDescription>
      <DatabaseForm
        database={database}
        onSubmit={onStepSubmit}
        onCancel={handleCancel}
      />
    </ActiveStep>
  );
};

interface DatabaseFormProps {
  database?: DatabaseInfo;
  onSubmit?: (database: DatabaseInfo) => void;
  onCancel?: () => void;
}

const DatabaseForm = ({ database, onSubmit, onCancel }: DatabaseFormProps) => {
  return (
    <Databases.Form
      form={Databases.forms.setup}
      formName="database"
      database={database}
      onSubmit={onSubmit}
    >
      {({ formFields, Form, FormField, FormFooter }: FormProps) => (
        <Form>
          {formFields.map(({ name }) => (
            <FormField key={name} name={name} />
          ))}
          {
            <FormFooter
              submitTitle={t`Connect database`}
              cancelTitle={t`Skip`}
              onCancel={onCancel}
            />
          }
        </Form>
      )}
    </Databases.Form>
  );
};

const getStepTitle = (
  database: DatabaseInfo | undefined,
  isStepCompleted: boolean,
) => {
  if (!isStepCompleted) {
    return t`Add your data`;
  } else if (database) {
    return t`Connecting to ${database.name}`;
  } else {
    return t`I'll add my own data later`;
  }
};

export default DatabaseStep;
