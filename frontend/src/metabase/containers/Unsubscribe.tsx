import { useState } from "react";
import { useAsync } from "react-use";
import { Location } from "history";
import { t, jt } from "ttag";

import { Center, Stack, Text } from "metabase/ui";
import { SessionApi } from "metabase/services";
import { isEmpty } from "metabase/lib/validate";
import { NotFound } from "metabase/containers/ErrorPages";
import { color } from "metabase/lib/colors";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import Button from "metabase/core/components/Button";
import LogoIcon from "metabase/components/LogoIcon";
import {
  StyledMetabotLogo,
  LayoutBody,
  LayoutCard,
  LayoutIllustration,
  LayoutRoot,
  CheckmarkIcon,
} from "metabase/containers/Unsubscribe.styled";

const ERRORS = {
  MISSING_REQUIRED_PARAMETERS: "missing required parameters",
};

const SUBSCRIPTION = {
  UNSUBSCRIBE: "unsubscribe",
  RESUBSCRIBE: "resubscribe",
};

interface UnsubscribeQueryString {
  hash: string;
  email: string;
  "pulse-id": string;
}

interface UnsubscribeProps {
  location: Location<UnsubscribeQueryString>;
}

export const UnsubscribePage = ({
  location,
}: UnsubscribeProps): JSX.Element => {
  const [subscriptionChange, setSubscriptionChange] = useState(
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
    if (error?.message === ERRORS.MISSING_REQUIRED_PARAMETERS) {
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

interface SubscriptionDetailProps {
  email: string;
  alertTitle: string | undefined;
  action: () => void;
}

function SuccessfulUnsubscribe({
  email,
  alertTitle,
  action,
}: SubscriptionDetailProps) {
  return (
    <Stack align="center">
      <CheckmarkIcon name="check" size={30} />
      <Text
        fw={700}
        c={color("text-medium")}
        mb="0.75rem"
        ta="center"
      >{jt`You've unsubscribed ${(
        <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
      )} from the "${alertTitle}" alert.`}</Text>
      <Button primary onClick={action}>
        Undo
      </Button>
    </Stack>
  );
}

function SuccessfulResubscribe({
  email,
  alertTitle,
  action,
}: SubscriptionDetailProps) {
  return (
    <Stack align="center">
      <CheckmarkIcon name="check" size={30} />
      <Text
        fw={700}
        c={color("text-medium")}
        mb="0.75rem"
        ta="center"
      >{jt`Okay, ${(
        <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
      )} is subscribed to the "${alertTitle}" alert again.`}</Text>
      <Button primary onClick={action}>
        Unsubscribe
      </Button>
    </Stack>
  );
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

function UnsubscribeRoot({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <LayoutRoot>
      <LayoutIllustration />
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
    <>
      <StyledMetabotLogo variant="sad" />
      <Text
        fw={700}
        fz="md"
        mt={"1.5rem"}
      >{t`Whoops, something went wrong.`}</Text>
      <Text
        fz="md"
        mt={"0.25rem"}
      >{t`Please give it a minute and try again`}</Text>
    </>
  );
}
