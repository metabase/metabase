import { useCallback } from "react";
import { t } from "ttag";
import { updateIn } from "icepick";
import DatabaseForm from "metabase/databases/containers/DatabaseForm";
import { DatabaseData } from "metabase-types/api";
import { InviteInfo, UserInfo } from "metabase-types/store";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import InviteUserForm from "../InviteUserForm";
import SetupSection from "../SetupSection";
import { StepDescription } from "./DatabaseStep.styled";

export interface DatabaseStepProps {
  user?: UserInfo;
  database?: DatabaseData;
  engine?: string;
  invite?: InviteInfo;
  isEmailConfigured: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onEngineChange: (engine?: string) => void;
  onStepSelect: () => void;
  onDatabaseSubmit: (database: DatabaseData) => void;
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
  const handleSubmit = useCallback(
    async (database: DatabaseData) => {
      try {
        await onDatabaseSubmit(database);
      } catch (error) {
        throw getSubmitError(error);
      }
    },
    [onDatabaseSubmit],
  );

  const handleCancel = useCallback(() => {
    onStepCancel(engine);
  }, [engine, onStepCancel]);

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
        initialValues={database}
        onSubmit={handleSubmit}
        onEngineChange={onEngineChange}
        onCancel={handleCancel}
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

const getStepTitle = (
  database: DatabaseData | undefined,
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseStep;
