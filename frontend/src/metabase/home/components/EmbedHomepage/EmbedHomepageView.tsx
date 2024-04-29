import { Link } from "react-router";
import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import {
  Anchor,
  Card,
  Group,
  Menu,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { InteractiveTabContent } from "./InteractiveTabContent";
import { StaticTabContent } from "./StaticTabContent";
import type { EmbeddingHomepageInitialTab } from "./types";

export type EmbedHomepageViewProps = {
  embeddingAutoEnabled: boolean;
  exampleDashboardId: number | null;
  licenseActiveAtSetup: boolean;
  initialTab: EmbeddingHomepageInitialTab;
  onDismiss: (reason: EmbeddingHomepageDismissReason) => void;
  // links
  interactiveEmbeddingQuickstartUrl: string;
  embeddingDocsUrl: string;
  analyticsDocsUrl: string;
  learnMoreStaticEmbedUrl: string;
  learnMoreInteractiveEmbedUrl: string;
};

export const EmbedHomepageView = (props: EmbedHomepageViewProps) => {
  const {
    embeddingAutoEnabled,
    initialTab,
    embeddingDocsUrl,
    analyticsDocsUrl,
    onDismiss,
  } = props;
  return (
    <Stack maw={550}>
      <Group position="apart">
        {/*  eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
        <Text fw="bold">{t`Get started with Embedding Metabase in your app`}</Text>
        <Menu trigger="hover" closeDelay={200}>
          <Menu.Target>
            <Text
              fw="bold"
              color="brand"
              className={CS.cursorDefault}
            >{t`Hide these`}</Text>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => onDismiss("dismissed-done")}
            >{t`Embedding done, all good`}</Menu.Item>
            <Menu.Item
              onClick={() => onDismiss("dismissed-run-into-issues")}
            >{t`I ran into issues`}</Menu.Item>
            <Menu.Item
              onClick={() => onDismiss("dismissed-not-interested-now")}
            >{t`I'm not interested right now`}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Card px="xl" py="lg">
        {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
        <Title order={2} mb="md">{t`Embedding Metabase`}</Title>
        <Tabs defaultValue={initialTab}>
          <Tabs.List>
            <Tabs.Tab value="interactive">{t`Interactive`}</Tabs.Tab>
            <Tabs.Tab value="static">{t`Static`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="interactive" pt="md">
            <InteractiveTabContent {...props} />
          </Tabs.Panel>

          <Tabs.Panel value="static" pt="md">
            <StaticTabContent {...props} />
          </Tabs.Panel>
        </Tabs>
      </Card>

      {embeddingAutoEnabled && (
        <Card>
          <Text
            color="text-dark"
            fw="bold"
          >{t`Embedding has been automatically enabled for you`}</Text>
          <Text color="text-light" size="sm">
            {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
            {jt`Because you expressed interest in embedding Metabase, we took this step for you so that you can more easily try it out. You can turn it off anytime in ${(
              <Anchor
                size="sm"
                component={Link}
                to="/admin/settings/embedding-in-other-applications"
                key="link"
              >
                admin/settings/embedding-in-other-applications
              </Anchor>
            )}.`}
          </Text>
        </Card>
      )}

      <Card>
        <Text color="text-dark" fw="bold">{t`Need more information?`}</Text>
        <Text color="text-light" size="sm">
          {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
          {jt`Explore the ${(
            <ExternalLink
              key="embedding-docs"
              href={embeddingDocsUrl}
            >{t`embedding documentation`}</ExternalLink>
          )} and ${(
            <ExternalLink
              key="customer-facing-analytics-docs"
              href={analyticsDocsUrl}
            >{t`customer-facing analytics articles`}</ExternalLink>
          )} to learn more about what Metabase offers.`}
        </Text>
      </Card>
    </Stack>
  );
};
