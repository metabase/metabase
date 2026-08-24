import { c, jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import { Alert, Box, Center, Stack, Text } from "metabase/ui";
import { isSameOrigin } from "metabase/utils/dom";

import S from "./EmbeddingAppSameSiteCookieDescription.module.css";

export const EmbeddingAppSameSiteCookieDescription = () => {
  const docsUrl = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- this settings widget only shows for admins
    getDocsUrl(state, {
      page: "embedding/interactive-embedding",
      anchor: "embedding-metabase-in-a-different-domain",
    }),
  );

  const embeddingSameSiteCookieSetting = useSetting("session-cookie-samesite");
  const embeddingAuthorizedOrigins = useSetting("embedding-app-origin");

  const shouldDisplayNote =
    embeddingAuthorizedOrigins &&
    embeddingSameSiteCookieSetting !== "none" &&
    authorizedOriginsContainsNonInstanceDomain(embeddingAuthorizedOrigins);

  return (
    <Stack gap="sm">
      {shouldDisplayNote && <AuthorizedOriginsNote />}
      <Text c="text-secondary">
        {
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- this settings widget only shows for admins
          t`Determines whether or not cookies are allowed to be sent on cross-site requests. You'll likely need to change this to None if your embedding application is hosted under a different domain than Metabase. Otherwise, leave it set to Lax, as it's more secure.`
        }
      </Text>

      <Text c="text-secondary">{c(
        "{0} is a 'Learn more' link to the embedding documentation",
      )
        .jt`If you set this to None, you'll have to use HTTPS, or browsers will reject the request. ${(
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
      <Alert size="compact" className={S.SameSiteAlert} color="warning">
        <Center>
          <Text component="span" ta="center">
            {jt`You should probably change this setting to ${(
              <Text key="inner" component="span" fw="bold" c="text-secondary">
                {t`None`}
              </Text>
            )}.`}
          </Text>
        </Center>
      </Alert>
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

  if (!authorizedOriginsString || authorizedOriginsString.trim() === "") {
    return false;
  }

  const origins = authorizedOriginsString.split(" ");
  return origins.some((origin) => !isSameOrigin(origin));
}
