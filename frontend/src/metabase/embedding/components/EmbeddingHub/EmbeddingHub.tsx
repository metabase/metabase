import { createRef, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import {
  Accordion,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  rem,
} from "metabase/ui";

import S from "../../../home/components/Onboarding/Onboarding.module.css";

type EmbeddingChecklistItemValue =
  | "static-embedding"
  | "interactive-embedding"
  | "embedding-sdk"
  | "customization"
  | "analytics";

export const EmbeddingHub = () => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isAdmin = useSelector(getUserIsAdmin);

  const itemRefs = useMemo(() => {
    return {
      "static-embedding": createRef<HTMLDivElement>(),
      "interactive-embedding": createRef<HTMLDivElement>(),
      "embedding-sdk": createRef<HTMLDivElement>(),
      customization: createRef<HTMLDivElement>(),
      analytics: createRef<HTMLDivElement>(),
    };
  }, []);

  type ItemKey = keyof typeof itemRefs;

  const isValidItemKey = useCallback(
    (key?: EmbeddingChecklistItemValue | null): key is ItemKey => {
      return key != null && key in itemRefs;
    },
    [itemRefs],
  );

  const [itemValue, setItemValue] =
    useState<EmbeddingChecklistItemValue | null>(null);

  const DEFAULT_ITEM: EmbeddingChecklistItemValue = "static-embedding";

  const scrollElementIntoView = (element?: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleValueChange = (newValue: EmbeddingChecklistItemValue | null) => {
    if (isValidItemKey(itemValue)) {
      const currentItem = itemRefs[itemValue].current;
      const iframe = currentItem?.querySelector("iframe");

      stopVideo(iframe);
    }

    if (newValue !== null && isValidItemKey(newValue)) {
      const newItem = itemRefs[newValue].current;
      scrollElementIntoView(newItem);
    }

    setItemValue(newValue);
  };

  const utmTags = {
    utm_source: "product",
    utm_medium: "docs",
    utm_campaign: "help",
    utm_content: "embedding-hub",
  };

  const embeddingDocsLink = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/introduction",
      utm: utmTags,
    }),
  );

  const staticEmbeddingDocsLink = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/static-embedding",
      utm: utmTags,
    }),
  );

  const interactiveEmbeddingDocsLink = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding",
      utm: utmTags,
    }),
  );

  const embeddingSDKDocsLink = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/sdk/introduction",
      utm: utmTags,
    }),
  );

  return (
    <Box
      mih="100%"
      className={S.page}
      px={{ base: "md", md: "lg", lg: rem(48) }}
      pt="xl"
      pb={212}
    >
      <Box maw={592} m="0 auto">
        <Title order={1} mb="xl">{t`Embedding Hub`}</Title>
        <Text mb="xl" c="text-medium">
          {t`Your central place for managing embedding features and getting your data into external applications.`}
        </Text>

        <Accordion
          defaultValue={DEFAULT_ITEM}
          classNames={{
            chevron: S.chevron,
            content: S.content,
            control: S.control,
            icon: S.icon,
            item: S.item,
            label: S.label,
          }}
          onChange={(value: string | null) =>
            handleValueChange(value as EmbeddingChecklistItemValue | null)
          }
        >
          <Box mb={64}>
            <Title order={3} mb="lg">{t`Choose your embedding approach`}</Title>
            <Accordion.Item
              value="static-embedding"
              data-testid="static-embedding-item"
              ref={itemRefs["static-embedding"]}
            >
              <Accordion.Control icon={<Icon name="embed" />}>
                {t`Static embedding`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="lg">
                  <Text>
                    {t`Embed read-only charts and dashboards directly into your application using signed URLs and iframe tags. Perfect for customer-facing dashboards and reports.`}
                  </Text>
                  <Text>
                    {t`Features:`}
                    <ul className={S.list}>
                      <li>{t`Signed URLs for secure access`}</li>
                      <li>{t`Customizable appearance and theming`}</li>
                      <li>{t`No user management required`}</li>
                      <li>{t`Works with any web framework`}</li>
                    </ul>
                  </Text>
                  {isAdmin && (
                    <Group gap="sm" data-testid="static-embedding-cta">
                      <Link to="/admin/settings/embedding-in-other-applications/standalone">
                        <Button variant="outline">{t`Configure static embedding`}</Button>
                      </Link>
                      {showMetabaseLinks && (
                        <ExternalLink href={staticEmbeddingDocsLink}>
                          <Button variant="subtle">{t`View docs`}</Button>
                        </ExternalLink>
                      )}
                    </Group>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item
              value="interactive-embedding"
              data-testid="interactive-embedding-item"
              ref={itemRefs["interactive-embedding"]}
            >
              <Accordion.Control icon={<Icon name="click" />}>
                {t`Interactive embedding`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="lg">
                  <Text>
                    {t`Embed fully interactive ${applicationName} experiences with drill-down, filtering, and exploration capabilities. Users can interact with data as if they were in ${applicationName}.`}
                  </Text>
                  <Text>
                    {t`Features:`}
                    <ul className={S.list}>
                      <li>{t`Full interactivity with drill-downs and filters`}</li>
                      <li>{t`User authentication and permissions`}</li>
                      <li>{t`Customizable UI components`}</li>
                      <li>{t`Multi-tenant architecture support`}</li>
                    </ul>
                  </Text>
                  {isAdmin && (
                    <Group gap="sm" data-testid="interactive-embedding-cta">
                      <Link to="/admin/settings/embedding-in-other-applications/full-app">
                        <Button variant="outline">{t`Configure interactive embedding`}</Button>
                      </Link>
                      {showMetabaseLinks && (
                        <ExternalLink href={interactiveEmbeddingDocsLink}>
                          <Button variant="subtle">{t`View docs`}</Button>
                        </ExternalLink>
                      )}
                    </Group>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item
              value="embedding-sdk"
              data-testid="embedding-sdk-item"
              ref={itemRefs["embedding-sdk"]}
            >
              <Accordion.Control icon={<Icon name="snippet" />}>
                {t`Embedding SDK`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="lg">
                  <Text>
                    {t`Build custom analytics experiences using our React SDK. Integrate ${applicationName} components directly into your React application with full customization.`}
                  </Text>
                  <Text>
                    {t`Features:`}
                    <ul className={S.list}>
                      <li>{t`React components for questions, dashboards, and more`}</li>
                      <li>{t`Programmatic control over data and visualizations`}</li>
                      <li>{t`Custom styling and theming`}</li>
                      <li>{t`TypeScript support`}</li>
                    </ul>
                  </Text>
                  {isAdmin && (
                    <Group gap="sm" data-testid="embedding-sdk-cta">
                      {showMetabaseLinks && (
                        <ExternalLink href={embeddingSDKDocsLink}>
                          <Button variant="outline">{t`Get started with SDK`}</Button>
                        </ExternalLink>
                      )}
                      <Link to="/admin/settings/embedding-in-other-applications/standalone">
                        <Button variant="subtle">{t`Configure JWT`}</Button>
                      </Link>
                    </Group>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>

          <Box mb={64}>
            <Title order={3} mb="lg">{t`Customize and optimize`}</Title>
            <Accordion.Item
              value="customization"
              data-testid="customization-item"
              ref={itemRefs["customization"]}
            >
              <Accordion.Control icon={<Icon name="palette" />}>
                {t`Appearance and branding`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="lg">
                  <Text>
                    {t`Customize the look and feel of your embedded analytics to match your brand. Control colors, fonts, logos, and layout to create a seamless user experience.`}
                  </Text>
                  <Text>
                    {t`Customization options:`}
                    <ul className={S.list}>
                      <li>{t`Custom color themes and palettes`}</li>
                      <li>{t`Logo and branding customization`}</li>
                      <li>{t`Font and typography control`}</li>
                      <li>{t`Hide or show UI elements`}</li>
                    </ul>
                  </Text>
                  {isAdmin && (
                    <Box data-testid="customization-cta">
                      <Link to="/admin/appearance">
                        <Button variant="outline">{t`Customize appearance`}</Button>
                      </Link>
                    </Box>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item
              value="analytics"
              data-testid="analytics-item"
              ref={itemRefs["analytics"]}
            >
              <Accordion.Control icon={<Icon name="dashboard" />}>
                {t`Usage analytics`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="lg">
                  <Text>
                    {t`Monitor how your embedded analytics are being used. Track user engagement, popular content, and performance metrics to optimize your embedding strategy.`}
                  </Text>
                  <Text>
                    {t`Available insights:`}
                    <ul className={S.list}>
                      <li>{t`Embedding usage statistics`}</li>
                      <li>{t`Popular questions and dashboards`}</li>
                      <li>{t`User engagement metrics`}</li>
                      <li>{t`Performance monitoring`}</li>
                    </ul>
                  </Text>
                  {isAdmin && (
                    <Box data-testid="analytics-cta">
                      <Link to="/admin/tools/logs">
                        <Button variant="outline">{t`View usage analytics`}</Button>
                      </Link>
                    </Box>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>
        </Accordion>

        {showMetabaseLinks && (
          <Box component="footer">
            <Box data-testid="embedding-docs-section" mb="xl">
              <Title order={3} mb={12}>{t`Learn more about embedding`}</Title>
              <Text>
                {t`For detailed guides, examples, and best practices, check out our comprehensive `}
                <ExternalLink
                  href={embeddingDocsLink}
                >{t`embedding documentation`}</ExternalLink>
                {t`.`}
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const stopVideo = (iframe?: HTMLIFrameElement | null) => {
  if (!iframe) {
    return;
  }

  iframe.contentWindow?.postMessage(
    JSON.stringify({
      event: "command",
      func: "stopVideo",
      args: [],
    }),
    "*",
  );
};
