import React, { useEffect } from "react";
import { t } from "ttag";
import { updateIn } from "icepick";
import Databases from "metabase/entities/databases";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import SetupSection from "../SetupSection";
import { StepDescription } from "./DatabaseStep.styled";
import { FormProps } from "./types";
import { DatabaseInfo } from "../../types";

export interface Props {
  database?: DatabaseInfo;
  engine?: string;
  isHosted: boolean;
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
  isHosted,
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

  const handleSubmit = async (database: DatabaseInfo) => {
    try {
      await onStepSubmit(database);
    } catch (error) {
      throw getSubmitError(error);
    }
  };

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
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
      {isHosted && (
        <SetupSection
          title={t`Need help connecting to your data?`}
          description={t`Invite a teammate. We’ll make them an admin so they can configure your database. You can always change this later on.`}
        />
      )}
    </ActiveStep>
  );
};

interface DatabaseFormProps {
  database?: DatabaseInfo;
  onSubmit: (database: DatabaseInfo) => void;
  onCancel: () => void;
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

const getSubmitError = (error: unknown) => {
  return updateIn(error, ["data", "errors"], errors => ({
    details: errors,
  }));
};

export default DatabaseStep;
