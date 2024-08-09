import cx from "classnames";
import { useEffect, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { createAlert } from "metabase/alert/alert";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import MetabaseCookies from "metabase/lib/cookies";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import {
  hasConfiguredAnyChannelSelector,
  hasConfiguredEmailChannelSelector,
  hasLoadedChannelInfoSelector,
} from "metabase/pulse/selectors";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getDefaultAlert } from "metabase-lib/v1/Alert";
import type Question from "metabase-lib/v1/Question";

import { AlertEditForm } from "./AlertEditForm";
import { AlertEducationalScreen } from "./AlertEducationalScreen";
import { AlertModalTitle } from "./AlertModalTitle";
import { AlertModalFooter } from "./AlertModals.styled";

type CreateAlertModalContentProps = {
  onAlertCreated: () => void;
  onCancel: () => void;
};

type CreateAlertModalContentInnerProps = CreateAlertModalContentProps & {
  question: Question;
};

export const CreateAlertModalContentInner = ({
  question,
  onAlertCreated,
  onCancel,
}: CreateAlertModalContentInnerProps) => {
  const visualizationSettings = useSelector(getVisualizationSettings);
  const isAdmin = useSelector(getUserIsAdmin);
  const user = useSelector(getUser);
  const hasLoadedChannelInfo = useSelector(hasLoadedChannelInfoSelector);
  const hasConfiguredAnyChannel = useSelector(hasConfiguredAnyChannelSelector);
  const hasConfiguredEmailChannel = useSelector(
    hasConfiguredEmailChannelSelector,
  );

  const dispatch = useDispatch();

  const [hasSeenEducationalScreen, setHasSeenEducationalScreen] = useState(
    MetabaseCookies.getHasSeenAlertSplash(),
  );
  const [alert, setAlert] = useState(
    getDefaultAlert(question, user, visualizationSettings),
  );

  useMount(() => {
    dispatch(fetchPulseFormInput());
  });

  useEffect(() => {
    setAlert(oldAlert => ({
      ...oldAlert,
      card: { ...oldAlert.card, id: question.id() },
    }));
  }, [question]);

  const onCreateAlert = async () => {
    await dispatch(createAlert(alert));
    await dispatch(updateUrl(question, { dirty: false }));

    onAlertCreated();
  };

  const proceedFromEducationalScreen = () => {
    MetabaseCookies.setHasSeenAlertSplash(true);
    setHasSeenEducationalScreen(true);
  };

  const channelRequirementsMet = isAdmin
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailChannel;
  const isValid = alertIsValid(alert);

  if (hasLoadedChannelInfo && !channelRequirementsMet) {
    return (
      <ChannelSetupModal
        user={user}
        onClose={onCancel}
        entityNamePlural={t`alerts`}
        channels={isAdmin ? ["email", "Slack"] : ["email"]}
        fullPageModal
      />
    );
  }
  if (!hasSeenEducationalScreen) {
    return (
      <ModalContent onClose={onCancel} data-testid="alert-education-screen">
        <AlertEducationalScreen onProceed={proceedFromEducationalScreen} />
      </ModalContent>
    );
  }

  return (
    <ModalContent data-testid="alert-create" onClose={onCancel}>
      <div
        className={cx(CS.mlAuto, CS.mrAuto, CS.mb4)}
        style={{ maxWidth: "550px" }}
      >
        <AlertModalTitle text={t`Let's set up your alert`} />
        <AlertEditForm
          alertType={question.alertType(visualizationSettings)}
          alert={alert}
          onAlertChange={setAlert}
        />
        <AlertModalFooter>
          <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{ default: t`Done` }}
            disabled={!isValid}
            onClickOperation={onCreateAlert}
          />
        </AlertModalFooter>
      </div>
    </ModalContent>
  );
};

export const CreateAlertModalContent = (
  props: CreateAlertModalContentProps,
) => {
  const question = useSelector(getQuestion);

  if (!question) {
    return null;
  }

  return <CreateAlertModalContentInner question={question} {...props} />;
};
