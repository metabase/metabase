import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import MetabaseCookies from "metabase/lib/cookies";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { createAlert } from "metabase/notifications/redux/alert";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import { getDefaultAlert } from "metabase-lib/v1/Alert";
import type { Alert } from "metabase-types/api";

import { AlertEditForm } from "./AlertEditForm";
import { AlertEducationalScreen } from "./AlertEducationalScreen";
import { AlertModalTitle } from "./AlertModalTitle";
import AlertModalsS from "./AlertModals.module.css";

interface CreateAlertModalContentProps {
  onAlertCreated: () => void;
  onCancel: () => void;
}

export const CreateAlertModalContent = ({
  onAlertCreated,
  onCancel,
}: CreateAlertModalContentProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const visualizationSettings = useSelector(getVisualizationSettings);
  const isAdmin = useSelector(getUserIsAdmin);
  const user = useSelector(getUser);

  const { data: channelSpec = {}, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  const [alert, setAlert] = useState<any>(
    getDefaultAlert(question, user, visualizationSettings),
  );

  const [hasSeenEducationalScreen, setHasSeenEducationalScreen] = useState(
    MetabaseCookies.getHasSeenAlertSplash(),
  );

  useEffect(() => {
    // NOTE Atte Keinänen 11/6/17: Don't fill in the card information yet
    // Because `onCreate` and `onSave` of QueryHeader mix Redux action dispatches and `setState` calls,
    // we don't have up-to-date card information in the constructor yet
    // TODO: Refactor QueryHeader so that `onCreate` and `onSave` only call Redux actions and don't modify the local state
    setAlert((currentAlert: any) => ({
      ...currentAlert,
      card: { ...currentAlert.card, id: question?.id() },
    }));
  }, [question]);

  const onAlertChange = (newAlert: Alert) => setAlert(newAlert);

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

  const isValid = alertIsValid(alert, channelSpec);

  if (!isLoadingChannelInfo && !channelRequirementsMet) {
    return (
      <ChannelSetupModal
        user={user}
        onClose={onCancel}
        entityNamePlural={t`alerts`}
        channels={isAdmin ? ["email", "Slack", "Webhook"] : ["email"]}
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

  // TODO: Remove PulseEdit css hack
  return (
    <ModalContent data-testid="alert-create" onClose={onCancel}>
      <div
        className={cx(CS.mlAuto, CS.mrAuto, CS.mb4)}
        style={{ maxWidth: "550px" }}
      >
        <AlertModalTitle text={t`Let's set up your alert`} />
        <AlertEditForm
          alertType={question?.alertType(visualizationSettings)}
          alert={alert}
          onAlertChange={onAlertChange}
        />
        <Flex className={AlertModalsS.AlertModalsFooter}>
          <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{ default: t`Done` }}
            disabled={!isValid}
            onClickOperation={onCreateAlert}
          />
        </Flex>
      </div>
    </ModalContent>
  );
};
