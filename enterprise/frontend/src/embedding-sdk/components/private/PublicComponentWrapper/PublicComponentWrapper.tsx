import type { JSX } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import { SdkLoader } from "embedding-sdk/components/private/PublicComponentWrapper/SdkLoader";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Stack, Title, Anchor } from "metabase/ui";

export const PublicComponentWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const loginStatus = useSdkSelector(getLoginStatus);

  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  let content = children;

  if (loginStatus.status === "uninitialized") {
    content = <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "validated") {
    content = <div>{t`JWT is valid.`}</div>;
  }

  if (loginStatus.status === "loading") {
    content = <SdkLoader />;
  }

  if (loginStatus.status === "error") {
    if (loginStatus.error.message === t`Can't use API Keys in production`) {
      content = (
        <Stack align="center" spacing={0}>
          <Title order={4}>{`API keys do not work in production.`}</Title>
          <Title order={6} c="gray">{`Please switch to using a JWT token for
      production use.`}</Title>
          {showMetabaseLinks && (
            <Anchor
              underline={true}
              size="sm"
              href="https://www.metabase.com/docs/latest/people-and-groups/authenticating-with-jwt"
            >
              {`Learn more here`}
            </Anchor>
          )}
        </Stack>
      );
    } else {
      content = <SdkError message={loginStatus.error.message} />;
    }
  }

  return <PublicComponentStylesWrapper>{content}</PublicComponentStylesWrapper>;
};
