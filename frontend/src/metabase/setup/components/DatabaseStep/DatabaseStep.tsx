import React from "react";
import { t } from "ttag";
import { updateIn } from "icepick";
import { useDispatch, useSelector } from "metabase/lib/redux";
import DatabaseForm from "metabase/databases/containers/DatabaseForm";
import { DatabaseData } from "metabase-types/api";
import { InviteInfo } from "metabase-types/store";
import {
  selectStep,
  skipDatabase,
  submitDatabase,
  submitUserInvite,
  updateDatabaseEngine,
} from "../../actions";
import { DATABASE_STEP } from "../../constants";
import {
  getDatabase,
  getDatabaseEngine,
  getInvite,
  getIsEmailConfigured,
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
  getUser,
} from "../../selectors";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InvactiveStep";
import InviteUserForm from "../InviteUserForm";
import { SetupSection } from "../SetupSection";
import { StepDescription } from "./DatabaseStep.styled";

export const DatabaseStep = (): JSX.Element => {
  const user = useSelector(getUser);
  const database = useSelector(getDatabase);
  const engine = useSelector(getDatabaseEngine);
  const invite = useSelector(getInvite);
  const isEmailConfigured = useSelector(getIsEmailConfigured);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, DATABASE_STEP),
  );
  const isStepCompleted = useSelector(state =>
    getIsStepCompleted(state, DATABASE_STEP),
  );
  const isSetupCompleted = useSelector(getIsSetupCompleted);
  const dispatch = useDispatch();

  const handleEngineChange = (engine?: string) => {
    dispatch(updateDatabaseEngine(engine));
  };

  const handleDatabaseSubmit = async (database: DatabaseData) => {
    try {
      await dispatch(submitDatabase(database));
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  const handleInviteSubmit = (invite: InviteInfo) => {
    dispatch(submitUserInvite(invite));
  };

  const handleStepSelect = () => {
    dispatch(selectStep(DATABASE_STEP));
  };

  const handleStepCancel = () => {
    dispatch(skipDatabase(engine));
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, invite, isStepCompleted)}
        label={3}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={handleStepSelect}
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
        onSubmit={handleDatabaseSubmit}
        onEngineChange={handleEngineChange}
        onCancel={handleStepCancel}
      />
      {isEmailConfigured && (
        <SetupSection
          title={t`Need help connecting to your data?`}
          description={t`Invite a teammate. We’ll make them an admin so they can configure your database. You can always change this later on.`}
        >
          <InviteUserForm
            user={user}
            invite={invite}
            onSubmit={handleInviteSubmit}
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
