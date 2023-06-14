import { useAsync } from "react-use";
import { Location } from "history";
import { jt } from "ttag";

import { Center, Stack, Text } from "metabase/ui";
import { SessionApi } from "metabase/services";
import { isEmpty } from "metabase/lib/validate";
import { NotFound } from "metabase/containers/ErrorPages";
import { color } from "metabase/lib/colors";

import ExternalLink from "metabase/core/components/ExternalLink";
import Button from "metabase/core/components/Button";
import LogoIcon from "metabase/components/LogoIcon";
import {
  LayoutCard,
  LayoutIllustration,
  CheckmarkIcon,
} from "metabase/containers/Unsubscribe.styled";

const ERRORS = {
  MISSING_REQUIRED_PARAMETERS: "missing required parameters",
};

interface UnsubscribeQueryString {
  hash: string;
  email: string;
  "pulse-id": number;
}

interface UnsubscribeProps {
  location: Location<UnsubscribeQueryString>;
}

export const Unsubscribe = ({ location }: UnsubscribeProps): JSX.Element => {
  const hash = location?.query?.hash;
  const email = location?.query?.email;
  const pulseId = location?.query?.["pulse-id"];

  const { error } = useUnsubscribeRequest({ hash, email, pulseId });

  if (error?.message === ERRORS.MISSING_REQUIRED_PARAMETERS) {
    return <NotFound />;
  }

  // TODO: create page for isLoading and successful unsubscribe
  // * make into separate component to manage logic separately from main page

  // * ^ like this
  // return (
  //   <UnsubscribePage>
  //     <UnsubscribeBox
  //       isLoading={isLoading}
  //       error={error}>
  //     </UnsubscribeBox>
  //   </UnsubscribePage>
  // );

  return (
    <Center mih={"100%"} miw={"100%"} bgr="">
      <LayoutIllustration />
      <Stack>
        <LogoIcon height={65}></LogoIcon>
        <LayoutCard>
          <SuccessfulUnsubscribe email={email} />
        </LayoutCard>
      </Stack>
    </Center>
  );
};

// ! NEED TO ADD PULSE NAME TO MESSAGE ONCE ADDED ON BACK-END
function SuccessfulUnsubscribe({ email }: { email: string }) {
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
      )} from the #### alert.`}</Text>
      <Button primary>Undo</Button>
    </Stack>
  );
}

interface UseUnsubscribeProps {
  hash?: string;
  email?: string;
  pulseId?: number;
}

interface UseUnsubscribeResult {
  isLoading: boolean;
  error: Error | undefined;
}

function useUnsubscribeRequest({
  hash,
  email,
  pulseId,
}: UseUnsubscribeProps): UseUnsubscribeResult {
  const hasRequiredParameters =
    !isEmpty(hash) && !isEmpty(email) && !isEmpty(pulseId);

  const { loading: isLoading, error } = useAsync(async () => {
    if (!hasRequiredParameters) {
      throw new Error(ERRORS.MISSING_REQUIRED_PARAMETERS);
    }

    return await SessionApi.unsubscribe({ hash, email, "pulse-id": pulseId });
  });

  return { isLoading, error };
}
