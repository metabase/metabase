import React, { useEffect } from "react";
import { t } from "ttag";
import { updateIn } from "icepick";
import Users from "metabase/entities/users";
import Databases from "metabase/entities/databases";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import SetupSection from "../SetupSection";
import {
  StepActions,
  StepDescription,
  StepFormGroup,
  StepLink,
} from "./DatabaseStep.styled";
import { FormProps } from "./types";
import { DatabaseInfo, InviteInfo } from "../../types";

export interface Props {
  engine?: string;
  database?: DatabaseInfo;
  invite?: InviteInfo;
  isHosted: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onEngineChange: (engine: string) => void;
  onStepSelect: () => void;
  onDatabaseSubmit: (database: DatabaseInfo) => void;
  onInviteSubmit: (invite: InviteInfo) => void;
  onStepCancel: (engine?: string) => void;
}

const DatabaseStep = ({
  engine,
  database,
  invite,
  isHosted,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onEngineChange,
  onStepSelect,
  onDatabaseSubmit,
  onInviteSubmit,
  onStepCancel,
}: Props): JSX.Element => {
  useEffect(() => {
    engine && onEngineChange(engine);
  }, [engine, onEngineChange]);

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
        <div>{t`Not ready? Skip and play around with our Sample Dataset.`}</div>
      </StepDescription>
      <DatabaseForm
        engine={engine}
        database={database}
        onSubmit={onDatabaseSubmit}
      />
      <StepActions>
        <StepLink onClick={handleCancel}>{t`I'll add my data later`}</StepLink>
      </StepActions>
      {isHosted && (
        <SetupSection
          title={t`Need help connecting to your data?`}
          description={t`Invite a teammate. We’ll make them an admin so they can configure your database. You can always change this later on.`}
        >
          <InviteForm invite={invite} onSubmit={onInviteSubmit} />
        </SetupSection>
      )}
    </ActiveStep>
  );
};

interface DatabaseFormProps {
  engine?: string;
  database?: DatabaseInfo;
  onSubmit: (database: DatabaseInfo) => void;
}

const DatabaseForm = ({
  database,
  engine,
  onSubmit,
}: DatabaseFormProps): JSX.Element => {
  const handleSubmit = async (database: DatabaseInfo) => {
    try {
      await onSubmit(database);
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  return (
    <Databases.Form
      form={Databases.forms.setup}
      formName="database"
      database={database}
      onSubmit={handleSubmit}
    >
      {({ formFields, Form, FormField, FormFooter }: FormProps) => (
        <Form>
          {formFields.map(({ name }) => (
            <FormField key={name} name={name} />
          ))}
          {engine && <FormFooter submitTitle={t`Next`} />}
        </Form>
      )}
    </Databases.Form>
  );
};

interface InviteFormProps {
  invite?: InviteInfo;
  onSubmit: (invite: InviteInfo) => void;
}

const InviteForm = ({ invite, onSubmit }: InviteFormProps): JSX.Element => {
  return (
    <Users.Form
      form={Users.forms.setup_invite}
      user={invite}
      onSubmit={onSubmit}
    >
      {({ Form, FormField, FormFooter }: FormProps) => (
        <Form>
          <StepFormGroup>
            <FormField name="first_name" />
            <FormField name="last_name" />
          </StepFormGroup>
          <FormField name="email" />
          <FormFooter submitTitle={t`Send invitation`} />
        </Form>
      )}
    </Users.Form>
  );
};

const getStepTitle = (
  database: DatabaseInfo | undefined,
  invite: InviteInfo | undefined,
  isStepCompleted: boolean,
) => {
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

const getSubmitError = (error: unknown) => {
  return updateIn(error, ["data", "errors"], errors => ({
    details: errors,
  }));
};

export default DatabaseStep;
