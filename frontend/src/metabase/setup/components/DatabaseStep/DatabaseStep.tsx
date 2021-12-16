import React from "react";
import { t } from "ttag";
import { updateIn } from "icepick";
import Databases from "metabase/entities/databases";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { StepDescription } from "./DatabaseStep.styled";
import { FormProps } from "./types";
import { DatabaseInfo } from "../../types";

interface Props {
  database?: DatabaseInfo;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onChangeDatabase: (database: DatabaseInfo | null) => void;
  onValidateDatabase: (database: DatabaseInfo) => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const DatabaseStep = ({
  database,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onChangeDatabase,
  onValidateDatabase,
  onSelectThisStep,
  onSelectNextStep,
}: Props) => {
  const handleSubmit = async (database: DatabaseInfo) => {
    onChangeDatabase(await validateDatabase(database, onValidateDatabase));
    onSelectNextStep();
  };

  const handleCancel = () => {
    onChangeDatabase(null);
    onSelectNextStep();
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, isStepCompleted)}
        label={3}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onSelect={onSelectThisStep}
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

const validateDatabase = async (
  database: DatabaseInfo,
  onValidateDatabase: (database: DatabaseInfo) => void,
): Promise<DatabaseInfo> => {
  const sslDetails = { ...database.details, ssl: true };
  const sslDatabase = { ...database, details: sslDetails };
  const nonSslDetails = { ...database.details, ssl: false };
  const nonSslDatabase = { ...database, database: nonSslDetails };

  try {
    await onValidateDatabase(sslDatabase);
    return sslDatabase;
  } catch (error) {
    try {
      await onValidateDatabase(nonSslDatabase);
      return nonSslDatabase;
    } catch (error) {
      throw updateIn(error, ["data", "errors"], errors => ({
        details: errors,
      }));
    }
  }
};

export default DatabaseStep;
