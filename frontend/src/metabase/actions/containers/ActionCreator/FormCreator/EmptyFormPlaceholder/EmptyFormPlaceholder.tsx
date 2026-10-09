import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box, Icon, Stack, Text, Title } from "metabase/ui";

import S from "./EmptyFormPlaceholder.module.css";

export const EmptyFormPlaceholder = () => {
  const { url, showMetabaseLinks } = useDocsUrl("actions/custom");

  return (
    <Stack justify="center" h="100%" p="3rem" gap={0}>
      <Box className={S.iconContainer}>
        <Icon name="sql" size={62} />
        <Icon name="insight" size={24} pos="absolute" top={0} right={0} />
      </Box>
      <Title order={3} size="h4" mb="sm">
        {t`Build custom forms and business logic.`}
      </Title>
      <Text c="text-secondary" mt="sm">
        {t`Actions let you write parameterized SQL that writes back to your database. Actions can be attached to buttons on dashboards to create custom workflows. You can even publicly share the parameterized forms they generate to collect data.`}
      </Text>
      <Text c="text-secondary" mt="sm">
        {t`Here are a few ideas for what you can do with actions`}
        <Box component="ul" className={S.list}>
          <li>{t`Create a customer feedback form and embed it on your website.`}</li>
          <li>{t`Mark the customer you’re viewing in a dashboard as a VIP.`}</li>
          <li>{t`Let team members remove redundant data.`}</li>
        </Box>
      </Text>
      {showMetabaseLinks && (
        <ExternalLink className={S.link} href={url}>
          {t`See an example`}
        </ExternalLink>
      )}
    </Stack>
  );
};
