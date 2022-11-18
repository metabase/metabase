import React from "react";
import { t } from "ttag";
import _ from "underscore";
import { updateIn } from "icepick";
import Button from "metabase/core/components/Button";
import Databases from "metabase/entities/databases";
import DriverWarning from "metabase/containers/DriverWarning";
import { DatabaseInfo, InviteInfo, UserInfo } from "metabase-types/store";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import InviteUserForm from "../InviteUserForm";
import SetupSection from "../SetupSection";
import {
  StepActions,
  StepDescription,
  StepButton,
  FormActions,
} from "./DatabaseStep.styled";
import { FormProps } from "./types";

export interface DatabaseStepProps {
  user?: UserInfo;
  database?: DatabaseInfo;
  engine?: string;
  invite?: InviteInfo;
  isEmailConfigured: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onEngineChange: (engine?: string) => void;
  onStepSelect: () => void;
  onDatabaseSubmit: (database: DatabaseInfo) => void;
  onInviteSubmit: (invite: InviteInfo) => void;
  onStepCancel: (engine?: string) => void;
}

const DatabaseStep = ({
  user,
  database,
  engine,
  invite,
  isEmailConfigured,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onEngineChange,
  onStepSelect,
  onDatabaseSubmit,
  onInviteSubmit,
  onStepCancel,
}: DatabaseStepProps): JSX.Element => {
  const handleCancel = () => {
    onStepCancel(engine);
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, invite, isStepCompleted)}
        label={3}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={onStepSelect}
      />
    );
  }

  return (
    <ActiveStep
      title={getStepTitle(database, invite, isStepCompleted)}
      label={3}
    >
      <StepDescription>
        <div>{t`Are you ready to start exploring your data? Add it below.`}</div>
        <div>{t`Not ready? Skip and play around with our Sample Database.`}</div>
      </StepDescription>
      <DatabaseForm
        database={database}
        engine={engine}
        onSubmit={onDatabaseSubmit}
        onEngineChange={onEngineChange}
        onSkip={handleCancel}
      />
      {isEmailConfigured && (
        <SetupSection
          title={t`Need help connecting to your data?`}
          description={t`Invite a teammate. We’ll make them an admin so they can configure your database. You can always change this later on.`}
        >
          <InviteUserForm
            user={user}
            invite={invite}
            onSubmit={onInviteSubmit}
          />
        </SetupSection>
      )}
    </ActiveStep>
  );
};

interface DatabaseFormProps {
  database?: DatabaseInfo;
  engine?: string;
  onSubmit: (database: DatabaseInfo) => void;
  onEngineChange: (engine?: string) => void;
  onSkip: () => void;
}

const DatabaseForm = ({
  database,
  engine,
  onSubmit,
  onEngineChange,
  onSkip,
}: DatabaseFormProps): JSX.Element => {
  const handleSubmit = async (database: DatabaseInfo) => {
    try {
      await onSubmit(database);
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  const handleEngineChange = (value?: string) => {
    onEngineChange(value);
  };

  return (
    <Databases.Form
      form={Databases.forms.setup}
      formName="database"
      database={database}
      onSubmit={handleSubmit}
      submitTitle={t`Connect database`}
      useLegacyForm
    >
      {({
        Form,
        FormField,
        FormSubmit,
        FormMessage,
        formFields,
        values,
        onChangeField,
        submitTitle,
      }: FormProps) => (
        <Form>
          <FormField name="engine" onChange={handleEngineChange} />
          <DriverWarning
            engine={values.engine}
            onChange={engine => onChangeField("engine", engine)}
          />
          {_.reject(formFields, { name: "engine" }).map(({ name }) => (
            <FormField key={name} name={name} />
          ))}
          {engine ? (
            <FormActions>
              <FormMessage noPadding />
              <Button type="button" onClick={onSkip}>{t`Skip`}</Button>
              <FormSubmit className="ml2">{submitTitle}</FormSubmit>
            </FormActions>
          ) : (
            <StepActions>
              <StepButton onClick={onSkip}>
                {t`I'll add my data later`}
              </StepButton>
            </StepActions>
          )}
        </Form>
      )}
    </Databases.Form>
  );
};

const getStepTitle = (
  database: DatabaseInfo | undefined,
  invite: InviteInfo | undefined,
  isStepCompleted: boolean,
): string => {
  if (!isStepCompleted) {
    return t`Add your data`;
  } else if (database) {
    return t`Connecting to ${database.name}`;
  } else if (invite) {
    return t`I'll invite a teammate to connect the database`;
  } else {
    return t`I'll add my own data later`;
  }
};

const getSubmitError = (error: unknown): unknown => {
  return updateIn(error, ["data", "errors"], errors => ({
    details: errors,
  }));
};

export default DatabaseStep;
