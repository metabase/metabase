import { useFormikContext } from "formik";
import { updateIn } from "icepick";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { FormFooter } from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import {
  DatabaseForm,
  DatabaseFormProvider,
} from "metabase/databases/components/DatabaseForm";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { UnstyledButton } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";
import type { InviteInfo } from "metabase-types/store";

import {
  skipDatabase,
  submitDatabase,
  submitUserInvite,
  updateDatabaseEngine,
} from "../../actions";
import {
  getDatabase,
  getDatabaseEngine,
  getInvite,
  getIsEmailConfigured,
  getUser,
} from "../../selectors";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import { InviteUserForm } from "../InviteUserForm";
import { SetupSection } from "../SetupSection";
import type { NumberedStepProps } from "../types";

import S from "./DatabaseStep.module.css";
import { StepDescription } from "./DatabaseStep.styled";

export const DatabaseStep = ({ stepLabel }: NumberedStepProps): JSX.Element => {
  const { isStepActive, isStepCompleted } = useStep("db_connection");
  const user = useSelector(getUser);
  const database = useSelector(getDatabase);
  const engine = useSelector(getDatabaseEngine);
  const invite = useSelector(getInvite);
  const isEmailConfigured = useSelector(getIsEmailConfigured);

  const dispatch = useDispatch();

  const handleEngineChange = (engine?: string) => {
    dispatch(updateDatabaseEngine(engine));
  };

  const handleDatabaseSubmit = async (database: DatabaseData) => {
    try {
      await dispatch(submitDatabase(database)).unwrap();
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  const handleInviteSubmit = (invite: InviteInfo) => {
    dispatch(submitUserInvite(invite));
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

  return (
    <ActiveStep
      title={getStepTitle(database, invite, isStepCompleted)}
      label={stepLabel}
    >
      <StepDescription>
        <div>{t`Are you ready to start exploring your data? Add it below.`}</div>
        <div>{t`Not ready? Skip and play around with our Sample Database.`}</div>
      </StepDescription>

      <DatabaseFormProvider
        initialValues={database}
        onSubmit={handleDatabaseSubmit}
        onEngineChange={handleEngineChange}
      >
        {props => (
          <DatabaseForm
            {...props}
            footer={<DatabaseStepFormFooter onCancel={handleStepCancel} />}
          />
        )}
      </DatabaseFormProvider>

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

const DatabaseStepFormFooter = ({ onCancel }: { onCancel: () => void }) => {
  const { values } = useFormikContext<DatabaseData>();

  if (!values.engine) {
    return (
      <UnstyledButton
        className={S.linkButton}
        c="brand"
        p="0"
        mt="1rem"
        onClick={onCancel}
      >
        {t`I'll add my data later`}
      </UnstyledButton>
    );
  }

  return (
    <FormFooter>
      <FormErrorMessage inline />
      <Button type="button" onClick={onCancel}>{t`Skip`}</Button>
      <FormSubmitButton title={t`Connect database`} primary />
    </FormFooter>
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
