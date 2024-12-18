import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
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
import { ALERT_TYPE_ROWS, getDefaultAlert } from "metabase-lib/v1/Alert";
import type { Alert } from "metabase-types/api";

import { AlertEditForm } from "../AlertEditForm";
import { AlertModalTitle } from "../AlertModalTitle";
import AlertModalsS from "../AlertModals.module.css";

import ChannelSetupModal from "./ChannelSetupModal";

interface CreateAlertModalContentProps {
  notificationType: "alert" | "subscription";
  onAlertCreated: () => void;
  onCancel: () => void;
}

export const CreateAlertModalContent = ({
  notificationType,
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

  const alertType =
    (notificationType === "alert" &&
      question?.alertType(visualizationSettings)) ||
    ALERT_TYPE_ROWS;

  const [alert, setAlert] = useState<any>(
    getDefaultAlert(question, alertType, user),
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

  return (
    <ModalContent data-testid="alert-create" onClose={onCancel}>
      <div
        className={cx(CS.mlAuto, CS.mrAuto, CS.mb4)}
        style={{ maxWidth: "550px" }}
      >
        <AlertModalTitle text={t`Let's set up your alert`} />
        <AlertEditForm
          type={notificationType}
          alertType={alertType}
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
