import { jt, t } from "ttag";

import { Alert } from "metabase/common/components/Alert";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { isSameOrigin } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/utils";
import { getDocsUrl } from "metabase/selectors/settings";
import { Box, Center, Stack, Text } from "metabase/ui";

import S from "./EmbeddingAppSameSiteCookieDescription.module.css";

export const EmbeddingAppSameSiteCookieDescription = () => {
  const docsUrl = useSelector((state) =>
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
      <Text>{jt`Determines whether to allow cookies for cross-site requests. ${(
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
      <Alert className={S.SameSiteAlert} variant="warning" hasBorder>
        <Center>
          <Text>{jt`You should probably change this setting to ${(
            <Text key="inner" component="span" fw="bold">
              {t`None`}
            </Text>
          )}.`}</Text>
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

  if (isEmpty(authorizedOriginsString)) {
    return false;
  }

  const origins = authorizedOriginsString.split(" ");
  return origins.some((origin) => !isSameOrigin(origin));
}
