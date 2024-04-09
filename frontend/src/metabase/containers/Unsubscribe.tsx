import type { Location } from "history";
import { useState } from "react";
import { useAsync } from "react-use";
import { t, jt } from "ttag";

import { NotFound } from "metabase/components/ErrorPages";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import LogoIcon from "metabase/components/LogoIcon";
import {
  StyledMetabotLogo,
  LayoutBody,
  LayoutCard,
  LayoutIllustration,
  LayoutRoot,
  CheckmarkIcon,
} from "metabase/containers/Unsubscribe.styled";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { getLoginPageIllustration } from "metabase/selectors/whitelabel";
import { SessionApi } from "metabase/services";
import { Center, Stack, Text } from "metabase/ui";

const ERRORS = {
  MISSING_REQUIRED_PARAMETERS: "missing required parameters",
} as const;

const SUBSCRIPTION = {
  UNSUBSCRIBE: "unsubscribe",
  RESUBSCRIBE: "resubscribe",
} as const;

type Subscription = typeof SUBSCRIPTION[keyof typeof SUBSCRIPTION];

export const UnsubscribePage = ({
  location,
}: UnsubscribeProps): JSX.Element => {
  const [subscriptionChange, setSubscriptionChange] = useState<Subscription>(
    SUBSCRIPTION.UNSUBSCRIBE,
  );

  const hash = location?.query?.hash;
  const email = location?.query?.email;
  const pulseId = location?.query?.["pulse-id"];

  const { data, isLoading, error } = useUnsubscribeRequest({
    hash,
    email,
    pulseId,
    subscriptionChange,
  });

  if (error) {
    if (error.message === ERRORS.MISSING_REQUIRED_PARAMETERS) {
      return <NotFound />;
    }

    return (
      <UnsubscribeRoot>
        <ErrorDisplay />
      </UnsubscribeRoot>
    );
  }

  if (isLoading) {
    return (
      <UnsubscribeRoot>
        <LoadingAndErrorWrapper loading={isLoading} />
      </UnsubscribeRoot>
    );
  }

  return (
    <UnsubscribeRoot>
      {subscriptionChange === SUBSCRIPTION.UNSUBSCRIBE ? (
        <SuccessfulUnsubscribe
          email={email}
          alertTitle={data?.title}
          action={() => setSubscriptionChange(SUBSCRIPTION.RESUBSCRIBE)}
        />
      ) : (
        <SuccessfulResubscribe
          email={email}
          alertTitle={data?.title}
          action={() => setSubscriptionChange(SUBSCRIPTION.UNSUBSCRIBE)}
        />
      )}
    </UnsubscribeRoot>
  );
};

function SuccessfulUnsubscribe({
  email,
  alertTitle,
  action,
}: SubscriptionDetailProps) {
  return (
    <SuccessfulRequestWrapper
      text={jt`You've unsubscribed ${(
        <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
      )} from the "${alertTitle}" alert.`}
      buttonText={t`Undo`}
      action={action}
    />
  );
}

function SuccessfulResubscribe({
  email,
  alertTitle,
  action,
}: SubscriptionDetailProps) {
  return (
    <SuccessfulRequestWrapper
      text={jt`Okay, ${(
        <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
      )} is subscribed to the "${alertTitle}" alert again.`}
      buttonText={t`Unsubscribe`}
      action={action}
    />
  );
}

function SuccessfulRequestWrapper({
  text,
  buttonText,
  action,
}: SubscriptionWrapperProps) {
  return (
    <Stack align="center">
      <CheckmarkIcon name="check" size={30} />
      <Text fw={700} c={color("text-medium")} mb="0.75rem" ta="center">
        {text}
      </Text>
      <Button primary onClick={action}>
        {buttonText}
      </Button>
    </Stack>
  );
}

function useUnsubscribeRequest({
  hash,
  email,
  pulseId,
  subscriptionChange,
}: UseUnsubscribeProps): UseUnsubscribeResult {
  const hasRequiredParameters =
    !isEmpty(hash) && !isEmpty(email) && !isEmpty(pulseId);

  const {
    value: data,
    loading: isLoading,
    error,
  } = useAsync(async () => {
    if (!hasRequiredParameters) {
      throw new Error(ERRORS.MISSING_REQUIRED_PARAMETERS);
    }

    if (subscriptionChange === SUBSCRIPTION.UNSUBSCRIBE) {
      return await SessionApi.unsubscribe({
        hash,
        email,
        "pulse-id": pulseId,
      });
    }

    if (subscriptionChange === SUBSCRIPTION.RESUBSCRIBE) {
      return await SessionApi.undo_unsubscribe({
        hash,
        email,
        "pulse-id": pulseId,
      });
    }
  }, [subscriptionChange]);

  return { data, isLoading, error };
}

function UnsubscribeRoot({ children }: { children: JSX.Element }) {
  const loginPageIllustration = useSelector(getLoginPageIllustration);
  return (
    <LayoutRoot>
      {loginPageIllustration && (
        <LayoutIllustration
          data-testid="unsubscribe-page-illustration"
          backgroundImageSrc={loginPageIllustration.src}
          isDefault={loginPageIllustration.isDefault}
        />
      )}
      <LayoutBody>
        <Center mih={"100%"} miw={"100%"}>
          <Stack>
            <LogoIcon height={65}></LogoIcon>
            <LayoutCard>{children}</LayoutCard>
          </Stack>
        </Center>
      </LayoutBody>
    </LayoutRoot>
  );
}

function ErrorDisplay() {
  return (
    <Stack align="center" spacing="xs" aria-label="error message">
      <StyledMetabotLogo variant="sad" />
      <Text
        fw={700}
        fz="md"
        mt={"1.5rem"}
      >{t`Whoops, something went wrong.`}</Text>
      <Text fz="md">{t`Please give it a minute and try again`}</Text>
    </Stack>
  );
}

interface UnsubscribeQueryString {
  hash: string;
  email: string;
  "pulse-id": string;
}

interface UnsubscribeProps {
  location: Location<UnsubscribeQueryString>;
}

interface SubscriptionDetailProps {
  email: string;
  alertTitle: string | undefined;
  action: () => void;
}

interface SubscriptionWrapperProps {
  text: string | string[];
  buttonText: string;
  action: () => void;
}

interface UseUnsubscribeProps {
  hash: string | undefined;
  email: string | undefined;
  pulseId: string | undefined;
  subscriptionChange: string;
}

interface UseUnsubscribeResult {
  isLoading: boolean;
  error?: Error | undefined;
  data?: { title: string };
}
