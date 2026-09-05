import { useMemo, useRef } from "react";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  useDocsUrl,
  useHelpLink,
  useLearnUrl,
  useTempStorage,
} from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import type { ChecklistItemValue } from "metabase/redux/store";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Accordion, Box, Button, Stack, Text, Title, rem } from "metabase/ui";

import { AiProviderModalProvider } from "./AiProviderModal";
import S from "./Onboarding.module.css";
import { trackChecklistItemExpanded } from "./analytics";
import { useChecklistItems } from "./use-checklist-items";
import {
  ACCORDION_TRANSITION_DURATION,
  useScrollIntoItemView,
} from "./use-scroll-into-item-view";
import { createItemsRefs } from "./utils";

export const Onboarding = () => {
  const applicationName = useSelector(getApplicationName);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const itemsGroups = useChecklistItems();
  const itemsRefs = useMemo(() => createItemsRefs(itemsGroups), [itemsGroups]);
  const checklistRef = useRef<HTMLDivElement>(null);
  const [lastItemOpened, setLastItemOpened] = useTempStorage(
    "last-opened-onboarding-checklist-item",
  );
  const defaultItem =
    lastItemOpened && lastItemOpened in itemsRefs
      ? lastItemOpened
      : itemsGroups[0].items[0].value;

  useScrollIntoItemView(itemsRefs, lastItemOpened);

  const handleValueChange = (newValue: ChecklistItemValue | null) => {
    // Only one item is open at a time, so stopping every embed is enough to
    // silence the video in the item that is being collapsed.
    checklistRef.current?.querySelectorAll("iframe").forEach(stopVideo);

    if (newValue) {
      setLastItemOpened(newValue);
      trackChecklistItemExpanded(newValue);
    }
  };

  const { url: docsLink, showMetabaseLinks } = useDocsUrl("", {
    utm: {
      utm_source: "product",
      utm_campaign: "help",
      utm_content: "getting-started",
    },
  });
  const { url: learnLink } = useLearnUrl("");

  const helpLink = useHelpLink();

  return (
    <Box
      mih="100%"
      className={S.page}
      px={{ base: "lg", md: "xl", lg: rem(48) }}
      pt={30}
      pb={212}
    >
      <Box maw={592} m="0 auto" ref={checklistRef}>
        <AiProviderModalProvider>
          <Accordion
            className={S.accordion}
            defaultValue={defaultItem}
            transitionDuration={ACCORDION_TRANSITION_DURATION}
            classNames={{
              chevron: S.chevron,
              content: S.content,
              control: S.control,
              icon: S.icon,
              item: S.item,
              label: S.label,
            }}
            onChange={
              // `Accordion` is not generic, so it widens the value to `string`.
              // Everything it can emit is the `value` of an `Accordion.Item`
              // rendered below, all of which are `ChecklistItemValue`.
              (value) => handleValueChange(value as ChecklistItemValue | null)
            }
          >
            {itemsGroups.map((group) => (
              <Box key={group.title} mb={60}>
                <Title order={3} mb="xl">
                  {group.title}
                </Title>
                {group.items.map(({ Component, value }) => (
                  <Component
                    key={value}
                    value={value}
                    itemRef={itemsRefs[value]}
                  />
                ))}
              </Box>
            ))}
          </Accordion>
        </AiProviderModalProvider>
        {(showMetabaseLinks || isPaidPlan) && (
          <Box component="footer">
            {showMetabaseLinks && (
              <Box data-testid="learning-section" mb="xxl">
                <Title
                  order={3}
                  mb={12}
                >{t`Get the most out of ${applicationName}`}</Title>
                <Text>
                  {jt`${applicationName} can do a lot. To learn more—about ${applicationName}, data visualization, modeling, and other data topics—check out our ${(
                    <ExternalLink
                      href={docsLink}
                      key="docs"
                    >{t`Docs`}</ExternalLink>
                  )} and ${(
                    <ExternalLink
                      href={learnLink}
                      key="learn"
                    >{t`Learn`}</ExternalLink>
                  )} sites.`}
                </Text>
              </Box>
            )}
            {helpLink.visible && (
              <Box className={S.support} data-testid="help-section" p="xl">
                <Stack gap="xxs">
                  <Title order={4}>{t`Need to talk with someone?`}</Title>
                  <Text>{t`Reach out to engineers who can help with technical troubleshooting. Not your typical support agents.`}</Text>
                </Stack>
                <Button
                  component={ExternalLink}
                  href={helpLink.href}
                  variant="filled"
                >{t`Get Help`}</Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

const STOP_VIDEO_COMMAND = JSON.stringify({
  event: "command",
  func: "stopVideo",
  args: [],
});

const stopVideo = (iframe: HTMLIFrameElement) => {
  iframe.contentWindow?.postMessage(STOP_VIDEO_COMMAND, "*");
};
