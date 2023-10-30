import { jt, t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { Stack, Text } from "metabase/ui";
import ExternalLink from "metabase/core/components/ExternalLink";

export const EmbeddingAppSameSiteCookieDescription = () => {
  const docsUrl = useSelector(state =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding#embedding-metabase-in-a-different-domain",
    }),
  );

  return (
    <Stack mb="1rem" spacing="sm">
      <Text fw="bold">{t`SameSite cookie setting`}</Text>
      <Text>{t`Determines whether or not cookies are allowed to be sent on cross-site requests. You’ll likely need to change this to None if your embedding application is hosted under a different domain than Metabase. Otherwise, leave it set to Lax, as it's more secure.`}</Text>
      <Text>{jt`If you set this to None, you'll have to use HTTPS (unless you're just embedding locally), or browsers will reject the request. ${(
        <ExternalLink key="learn-more" href={docsUrl}>
          Learn more
        </ExternalLink>
      )}`}</Text>
    </Stack>
  );
};
