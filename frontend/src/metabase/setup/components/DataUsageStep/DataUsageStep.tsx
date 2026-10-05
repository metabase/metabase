import { getIn } from "icepick";
import { useState } from "react";
import { jt, t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Flex, Switch } from "metabase/ui";

import { goToNextStep, updateTracking } from "../../actions";
import { getIsTrackingAllowed } from "../../selectors";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

import S from "./DataUsageStep.module.css";

export const DataUsageStep = ({
  stepLabel,
}: NumberedStepProps): JSX.Element => {
  const { isStepActive, isStepCompleted } = useStep("data_usage");
  const [errorMessage, setErrorMessage] = useState<string>();
  const isTrackingAllowed = useSelector(getIsTrackingAllowed);
  const dispatch = useDispatch();

  const handleTrackingChange = async (isTrackingAllowed: boolean) => {
    try {
      await dispatch(updateTracking(isTrackingAllowed)).unwrap();
    } catch (error) {
      setErrorMessage(getSubmitError(error));
    }
  };

  const handleStepSubmit = async () => {
    try {
      await dispatch(goToNextStep()).unwrap();
    } catch (error) {
      setErrorMessage(getSubmitError(error));
      throw error;
    }
  };

  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/information-collection",
  );

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(isTrackingAllowed, isStepCompleted)}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
      />
    );
  }

  return (
    <ActiveStep
      title={getStepTitle(isTrackingAllowed, isStepCompleted)}
      label={stepLabel}
    >
      <Box c="text-secondary" mt="md" mb="lg">
        {t`In order to help us improve Metabase, we'd like to collect certain data about product usage.`}{" "}
        <ExternalLink
          href={docsUrl}
        >{t`Here's a full list of what we track and why.`}</ExternalLink>
      </Box>
      <Flex
        align="center"
        mr="xxl"
        mb="lg"
        p="lg"
        bd="2px solid var(--mb-color-border-neutral)"
        bdrs="sm"
      >
        <Switch
          flex="0 0 auto"
          checked={isTrackingAllowed}
          autoFocus
          onChange={(e) => handleTrackingChange(e.currentTarget.checked)}
          aria-labelledby="anonymous-usage-events-label"
        />
        <Box id="anonymous-usage-events-label" c="text-secondary" ml="sm">
          {t`Allow Metabase to anonymously collect usage events`}
        </Box>
      </Flex>
      {isTrackingAllowed && (
        <Box
          component="ul"
          className={S.infoList}
          c="text-secondary"
          mb="lg"
          lh={2}
        >
          <li>{jt`Metabase ${(
            <strong key="message">{t`never`}</strong>
          )} collects anything about your data or question results.`}</li>
          <li>{t`All collection is completely anonymous.`}</li>
          <li>{t`Collection can be turned off at any point in your admin settings.`}</li>
        </Box>
      )}
      <ActionButton
        normalText={t`Finish`}
        activeText={t`Finishing…`}
        failedText={t`Failed`}
        successText={t`Success`}
        variant="filled"
        type="button"
        actionFn={handleStepSubmit}
      />
      {errorMessage && (
        <Box c="feedback-negative" mt="sm">
          {errorMessage}
        </Box>
      )}
    </ActiveStep>
  );
};

const getStepTitle = (
  isTrackingAllowed: boolean,
  isStepCompleted: boolean,
): string => {
  if (!isStepCompleted) {
    return t`Usage data preferences`;
  } else if (isTrackingAllowed) {
    return t`Thanks for helping us improve`;
  } else {
    return t`We won't collect any usage events`;
  }
};

const getSubmitError = (error: unknown): string => {
  const message = getIn(error, ["data", "message"]);
  const errors = getIn(error, ["data", "errors"]);

  if (message) {
    return String(message);
  } else if (errors) {
    return String(Object.values(errors)[0]);
  } else {
    return t`An error occurred`;
  }
};
