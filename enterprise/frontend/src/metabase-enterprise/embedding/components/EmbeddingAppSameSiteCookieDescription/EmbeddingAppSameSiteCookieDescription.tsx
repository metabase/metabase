import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { isSameOrigin } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/utils";
import { getDocsUrl } from "metabase/selectors/settings";
import { Box, Center, Stack, Text } from "metabase/ui";

import { SameSiteAlert } from "./EmbeddingAppSameSiteCookieDescription.styled";

export const EmbeddingAppSameSiteCookieDescription = () => {
  const docsUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- Admin settings
    getDocsUrl(state, {
      page: "embedding/interactive-embedding",
      anchor: "embedding-metabase-in-a-different-domain",
    }),
  );

  const embeddingSameSiteCookieSetting = useSetting("session-cookie-samesite");
  const embeddingAuthorizedOrigins = useSetting("embedding-app-origin");

  const shouldDisplayNote =
    embeddingSameSiteCookieSetting !== "none" &&
    authorizedOriginsContainsNonInstanceDomain(embeddingAuthorizedOrigins);

  return (
    <Stack spacing="sm">
      {shouldDisplayNote && <AuthorizedOriginsNote />}
      {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
      <Text>{t`Determines whether or not cookies are allowed to be sent on cross-site requests. You’ll likely need to change this to None if your embedding application is hosted under a different domain than Metabase. Otherwise, leave it set to Lax, as it's more secure.`}</Text>
      <Text>{jt`If you set this to None, you'll have to use HTTPS, or browsers will reject the request. ${(
        <ExternalLink key="learn-more" href={docsUrl}>
          {t`Learn more`}
        </ExternalLink>
      )}`}</Text>
    </Stack>
  );
};

function AuthorizedOriginsNote() {
  return (
    <Box data-testid="authorized-origins-note" w="22rem">
      <SameSiteAlert variant="warning" hasBorder>
        <Center>
          <Text>{jt`You should probably change this setting to ${(
            <Text key="inner" span fw="bold">
              {t`None`}
            </Text>
          )}.`}</Text>
        </Center>
      </SameSiteAlert>
    </Box>
  );
}

function authorizedOriginsContainsNonInstanceDomain(
  authorizedOriginsString: string,
): boolean {
  // temporarily disabled because it suggest wrong SameSite value
  // for local development, where the origin is localhost and when the protocol is not specified
  // metabase#43523
  return false;

  if (isEmpty(authorizedOriginsString)) {
    return false;
  }

  const origins = authorizedOriginsString.split(" ");
  return origins.some(origin => !isSameOrigin(origin));
}
