import { useEffect } from "react";
import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Card, Flex, Icon, Text, Title } from "metabase/ui";

import { removeShowEmbedHomepageFlag } from "../../utils";

type EmbedMinimalHomepageProps = {
  onDismiss: () => void;
};

export const EmbedMinimalHomepage = ({
  onDismiss,
}: EmbedMinimalHomepageProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const learnMoreBaseUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/start" }),
  );

  const dismiss = () => {
    removeShowEmbedHomepageFlag();
    onDismiss();
  };

  useEffect(() => {
    // this card is only visible once
    removeShowEmbedHomepageFlag();
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <Card px={40} py={32} maw={320}>
      <Flex justify="space-between">
        <Title size="h4">{t`Embed Metabase in your app`}</Title>

        <Button
          variant="white"
          size="small"
          color="text-dark"
          p={0}
          onClick={dismiss}
        >
          <Icon name="close" />
        </Button>
      </Flex>

      <Text>{jt`${(
        <ExternalLink
          href={learnMoreBaseUrl + "?utm_media=embed-minimal-homepage"}
          key="link"
        >{t`Learn more`}</ExternalLink>
      )} about embedding`}</Text>
      <Link to="/admin/settings/embedding-in-other-applications">
        <Button
          size={"sm"}
          variant="filled"
          mt="lg"
          w="100%"
        >{t`Go to embedding settings`}</Button>
      </Link>
    </Card>
  );
};
