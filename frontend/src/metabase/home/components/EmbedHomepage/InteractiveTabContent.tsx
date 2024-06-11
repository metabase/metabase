import { Link } from "react-router";
import { t, jt } from "ttag";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Anchor, Button, Icon, Text, List } from "metabase/ui";

import type { EmbedHomepageViewProps } from "./EmbedHomepageView";
import { trackEmbeddingHomepageQuickstartClick } from "./analytics";

export const InteractiveTabContent = ({
  embeddingAutoEnabled,
  interactiveEmbeddingQuickstartUrl,
  exampleDashboardId,
  licenseActiveAtSetup,
  learnMoreInteractiveEmbedUrl,
  initialTab,
}: EmbedHomepageViewProps) => {
  return (
    <>
      <Text
        mb="md"
        lh="1.5"
      >{t`Use interactive embedding to offer multi-tenant, self-service analytics and dashboard creation in their own data sandbox. Pro and Enterprise plans only. `}</Text>

      <Text fw="bold" mb="md">{t`The TL;DR:`}</Text>

      <List type="ordered" mb="lg" size="sm">
        {!licenseActiveAtSetup && (
          <List.Item>
            <Anchor
              size="sm"
              component={Link}
              to="/admin/settings/license"
            >{t`Activate your commercial license`}</Anchor>
          </List.Item>
        )}
        {embeddingAutoEnabled === false && (
          <List.Item>
            <Anchor
              size="sm"
              component={Link}
              to="/admin/settings/embedding-in-other-applications"
            >{t`Enable embedding in the settings`}</Anchor>
          </List.Item>
        )}
        {exampleDashboardId === undefined && (
          <List.Item>{t`Create a dashboard to be embedded`}</List.Item>
        )}

        {/* eslint-disable-next-line no-literal-metabase-strings -- this homepage is only visible to admins*/}
        <List.Item>{t`Implement SSO to sign app users into Metabase`}</List.Item>
        {/* eslint-disable-next-line no-literal-metabase-strings -- this homepage is only visible to admins*/}
        <List.Item>{t`Embed Metabase in your app`}</List.Item>
        <List.Item>{t`Configure collection permissions`}</List.Item>
        <List.Item>{t`Setup data sandboxing to automatically scope data access based on user attributes`}</List.Item>
        <List.Item>{t`Hide any features you don't want to expose to your app’s users`}</List.Item>
        <List.Item>{t`Customize the look and feel of your application to match your brand.`}</List.Item>
      </List>

      <ExternalLink
        href={interactiveEmbeddingQuickstartUrl}
        // ExternalLink stops clicks events by default
        onClickCapture={_.noop}
        onClick={() => trackEmbeddingHomepageQuickstartClick(initialTab)}
      >
        <Button
          variant="filled"
          mb="sm"
          leftIcon={<Icon name="sql" />}
        >{t`Build it with the quick start`}</Button>
      </ExternalLink>
      <Text>{jt`${(
        <ExternalLink
          key="learn-more"
          href={learnMoreInteractiveEmbedUrl}
        >{t`Learn more`}</ExternalLink>
      )} about interactive embedding`}</Text>
    </>
  );
};
