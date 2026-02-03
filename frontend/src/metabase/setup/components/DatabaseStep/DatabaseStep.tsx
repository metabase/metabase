import { updateIn } from "icepick";
import { c, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  getDatabase,
  getDatabaseEngine,
  getInvite,
  getIsEmailConfigured,
  getUser,
} from "metabase/setup";
import { Text } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";
import type { InviteInfo } from "metabase-types/store";

import {
  skipDatabase,
  submitDatabase,
  submitUserInvite,
  updateDatabaseEngine,
} from "../../actions";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import { InviteUserForm } from "../InviteUserForm";
import { SetupSection } from "../SetupSection";
import type { NumberedStepProps } from "../types";

export const DatabaseStep = ({ stepLabel }: NumberedStepProps): JSX.Element => {
  const { isStepActive, isStepCompleted } = useStep("db_connection");
  const user = useSelector(getUser);
  const database = useSelector(getDatabase);
  const engine = useSelector(getDatabaseEngine);
  const invite = useSelector(getInvite);
  const isEmailConfigured = useSelector(getIsEmailConfigured);

  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const handleEngineChange = (engine?: string) => {
    dispatch(updateDatabaseEngine(engine));
  };

  const handleDatabaseSubmit = async (database: DatabaseData) => {
    try {
      await dispatch(submitDatabase(database)).unwrap();
      sendToast({
        message: c("{0} is a database name").t`Connected to ${database.name}`,
      });
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  const handleInviteSubmit = async (invite: InviteInfo) => {
    await dispatch(submitUserInvite(invite)).unwrap();
  };

  const handleStepCancel = () => {
    dispatch(skipDatabase(engine));
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(database, invite, isStepCompleted)}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
      />
    );
  }

  const optional = <strong key="optional">{t`(optional)`}</strong>;

  return (
    <ActiveStep
      title={getStepTitle(database, invite, isStepCompleted)}
      label={stepLabel}
    >
      <Text mt="sm" mb="md">
        {c("{0} refers to the word '(optional)'")
          .jt`Are you ready to start exploring your data? Add it below ${optional}.`}
      </Text>

      <DatabaseForm
        initialValues={database}
        onSubmit={handleDatabaseSubmit}
        onEngineChange={handleEngineChange}
        onCancel={handleStepCancel}
        showSampleDatabase={true}
        location="setup"
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
  return updateIn(error, ["data", "errors"], (errors) => ({
    details: errors,
  }));
};
