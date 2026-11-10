import type { Location } from "history";
import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import Button from "metabase/common/components/Button";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import LogoIcon from "metabase/common/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getLoginPageIllustration } from "metabase/selectors/whitelabel";
import {
  NotificationUnsubscribeApi,
  PulseUnsubscribeApi,
} from "metabase/services";
import { Center, Stack, Text } from "metabase/ui";

import {
  CheckmarkIcon,
  LayoutBody,
  LayoutCard,
  LayoutIllustration,
  LayoutRoot,
  StyledMetabotLogo,
} from "./Unsubscribe.styled";

const ERRORS = {
  MISSING_REQUIRED_PARAMETERS: "missing required parameters",
} as const;

const SUBSCRIPTION = {
  UNSUBSCRIBE: "unsubscribe",
  RESUBSCRIBE: "resubscribe",
} as const;

type Subscription = (typeof SUBSCRIPTION)[keyof typeof SUBSCRIPTION];

export const UnsubscribePage = ({
  location,
}: UnsubscribeProps): JSX.Element => {
  const [subscriptionChange, setSubscriptionChange] =
    useState<Subscription | null>(null);

  const hash = location?.query?.hash;
  const email = location?.query?.email;
  const pulseId = location?.query?.["pulse-id"];
  const notificationHandlerId = location?.query?.["notification-handler-id"];

  const { data, isLoading, error } = useUnsubscribeRequest({
    hash,
    email,
    pulseId,
    notificationHandlerId,
    subscriptionChange,
  });

  if (error || !email) {
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

  if (subscriptionChange === null) {
    return (
      <UnsubscribeRoot>
        <Stack align="center">
          <Text fw={700} c="text-secondary" ta="center">
            {t`Unsubscribe from these emails?`}
          </Text>
          <Text c="text-secondary" ta="center">
            {email}
          </Text>
          <Button
            primary
            onClick={() => setSubscriptionChange(SUBSCRIPTION.UNSUBSCRIBE)}
          >
            {t`Confirm unsubscribe`}
          </Button>
        </Stack>
      </UnsubscribeRoot>
    );
  }

  return (
    <UnsubscribeRoot>
      {subscriptionChange === SUBSCRIPTION.UNSUBSCRIBE ? (
        <SuccessfulUnsubscribe
          title={data?.title}
          action={() => setSubscriptionChange(SUBSCRIPTION.RESUBSCRIBE)}
        />
      ) : (
        <SuccessfulResubscribe
          title={data?.title}
          action={() => setSubscriptionChange(SUBSCRIPTION.UNSUBSCRIBE)}
        />
      )}
    </UnsubscribeRoot>
  );
};

function SuccessfulUnsubscribe({ title, action }: SubscriptionDetailProps) {
  return (
    <SuccessfulRequestWrapper
      text={
        title
          ? t`You've unsubscribed from "${title}".`
          : t`You've unsubscribed.`
      }
      buttonText={t`Undo`}
      action={action}
    />
  );
}

function SuccessfulResubscribe({ title, action }: SubscriptionDetailProps) {
  return (
    <SuccessfulRequestWrapper
      text={
        title
          ? t`You're subscribed to "${title}" again.`
          : t`You're subscribed again.`
      }
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
      <Text fw={700} c="text-secondary" mb="0.75rem" ta="center">
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
  notificationHandlerId,
  subscriptionChange,
}: UseUnsubscribeProps): UseUnsubscribeResult {
  const params = useMemo(() => {
    if (!hash || !email) {
      return undefined;
    }

    if (pulseId) {
      return {
        hash,
        email,
        "pulse-id": pulseId,
      };
    }

    if (notificationHandlerId) {
      return {
        hash,
        email,
        "notification-handler-id": notificationHandlerId,
      };
    }

    return undefined;
  }, [hash, email, pulseId, notificationHandlerId]);

  const {
    value: data,
    loading: isLoading,
    error,
  } = useAsync(async () => {
    if (!params) {
      throw new Error(ERRORS.MISSING_REQUIRED_PARAMETERS);
    }

    if (subscriptionChange === null) {
      return;
    }

    const api = notificationHandlerId
      ? NotificationUnsubscribeApi
      : PulseUnsubscribeApi;

    const method =
      subscriptionChange === SUBSCRIPTION.UNSUBSCRIBE
        ? api.unsubscribe
        : api.undo_unsubscribe;

    return await method(params);
  }, [params, subscriptionChange]);

  return { data, isLoading, error };
}

function UnsubscribeRoot({ children }: { children: JSX.Element }) {
  const loginPageIllustration = useSelector(getLoginPageIllustration);
  return (
    <LayoutRoot>
      {loginPageIllustration &&
        (loginPageIllustration.isDefault ? (
          <LighthouseIllustration />
        ) : (
          <LayoutIllustration
            data-testid="unsubscribe-page-illustration"
            backgroundImageSrc={loginPageIllustration.src}
          />
        ))}
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
    <Stack align="center" gap="xs" aria-label="error message">
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

type UnsubscribeQueryString = Partial<{
  hash: string;
  email: string;
  "pulse-id": string;
  "notification-handler-id": string;
}>;

interface UnsubscribeProps {
  location: Location<UnsubscribeQueryString>;
}

interface SubscriptionDetailProps {
  title: string | undefined;
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
  notificationHandlerId: string | undefined;
  subscriptionChange: Subscription | null;
}

interface UseUnsubscribeResult {
  isLoading: boolean;
  error?: Error | undefined;
  data?: { title: string };
}
