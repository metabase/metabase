import { type Ref, forwardRef, useRef, useState } from "react";
import { jt, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
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

import S from "./Onboarding.module.css";
import {
  trackChecklistItemCTAClicked,
  trackChecklistItemExpanded,
} from "./analytics";
import type { ChecklistItemValue } from "./types";

export const Onboarding = () => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const iframeRefs = {
    database: useRef<HTMLIFrameElement>(null),
    invite: useRef<HTMLIFrameElement>(null),
    "x-ray": useRef<HTMLIFrameElement>(null),
    notebook: useRef<HTMLIFrameElement>(null),
    sql: useRef<HTMLIFrameElement>(null),
    dashboard: useRef<HTMLIFrameElement>(null),
    subscription: useRef<HTMLIFrameElement>(null),
    alert: useRef<HTMLIFrameElement>(null),
  };

  const [itemValue, setItemValue] = useState<ChecklistItemValue | null>(null);

  const DEFAULT_ITEM = "database";

  const shouldConfigureCommunicationChannels =
    plan === "oss" || plan === "pro-self-hosted";

  const shouldShowSupport = plan !== "oss";

  const newQuestionUrl = Urls.newQuestion({
    mode: "notebook",
    creationType: "custom_question",
    collectionId: "root",
    cardType: "question",
  });

  const lastUsedDatabaseId = useSelector(state =>
    getSetting(state, "last-used-native-database-id"),
  );

  const newNativeQuestionUrl = Urls.newQuestion({
    type: "native",
    creationType: "native_question",
    collectionId: "root",
    cardType: "question",
    databaseId: lastUsedDatabaseId || undefined,
  });

  const sendMessage = (command: string, value: ChecklistItemValue) => {
    const iframeRef = iframeRefs[value];
    if (iframeRef.current) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*",
      );
    }
  };

  const stopVideo = (value: ChecklistItemValue) =>
    sendMessage("stopVideo", value);

  const handleValueChange = (newValue: ChecklistItemValue | null) => {
    if (newValue !== null) {
      trackChecklistItemExpanded(newValue);
    }

    const defaultItemInitiallyOpened = itemValue === null;

    setItemValue(newValue);
    stopVideo(defaultItemInitiallyOpened ? DEFAULT_ITEM : itemValue);
  };

  return (
    <Box
      mih="100%"
      className={S.page}
      px={{ base: "md", md: "lg", lg: rem(48) }}
      pt="xl"
      pb={212}
    >
      <Box maw={592}>
        <Accordion
          defaultValue={DEFAULT_ITEM}
          classNames={{
            item: S.item,
            content: S.content,
            control: S.control,
            label: S.label,
            icon: S.icon,
          }}
          onChange={(value: ChecklistItemValue | null) =>
            handleValueChange(value)
          }
        >
          <Box mb={64}>
            <Title order={2} mb={24}>{t`Set up your ${applicationName}`}</Title>
            <Accordion.Item value="database">
              <Accordion.Control icon={<Icon name="add_data" />}>
                {t`Connect to your database`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="dVNB-xJW0CY"
                    ref={iframeRefs["database"]}
                    title="How to add a new database?"
                  />

                  <Text>
                    {t`You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor.`}
                  </Text>
                  <Link
                    to="/admin/databases/create"
                    onClick={() => trackChecklistItemCTAClicked("database")}
                  >
                    <Button variant="outline">{t`Add Database`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="invite">
              <Accordion.Control icon={<Icon name="group" />}>
                {t`Invite people`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="dVNB-xJW0CY"
                    ref={iframeRefs["invite"]}
                    title={`How to invite your team mates to ${applicationName}`}
                  />
                  {/* TODO: different copy for different plans? */}
                  <Text>{t`Don't be shy with the invites.`}</Text>

                  <Group spacing={0}>
                    <Link
                      to="/admin/people"
                      onClick={() =>
                        trackChecklistItemCTAClicked("invite", "primary")
                      }
                    >
                      <Button variant="outline">{t`Invite people`}</Button>
                    </Link>
                    <Link
                      to="/admin/settings/authentication"
                      onClick={() =>
                        trackChecklistItemCTAClicked("invite", "secondary")
                      }
                    >
                      <Button variant="subtle">{t`Set up Single Sign-on`}</Button>
                    </Link>
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>

          <Box mb={64}>
            <Title order={2} mb={24}>{t`Start visualizing your data`}</Title>
            <Accordion.Item value="x-ray">
              <Accordion.Control icon={<Icon name="bolt" />}>
                {t`Create automatic dashboards`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="FOAXF4p1AL0"
                    ref={iframeRefs["x-ray"]}
                    si="COmu2w0SqGagUoVp"
                    title="How to find and use X-rays?"
                  />
                  <Text>
                    {jt`Hover over a table and click the yellow lightning bolt ${(
                      <Icon
                        name="bolt_filled"
                        size={14}
                        c="var(--mb-color-warning)"
                        className={S.inlineIcon}
                      />
                    )}. ${applicationName} will create a bunch of charts based on that data and arrange them on a dashboard.`}
                  </Text>
                  <Link
                    to="/browse/databases"
                    onClick={() => trackChecklistItemCTAClicked("x-ray")}
                  >
                    <Button variant="outline">{t`Browse data`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="notebook">
              <Accordion.Control icon={<Icon name="notebook" />}>
                {t`Make an interactive chart with the query builder`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="N9pR8KyaWzY"
                    ref={iframeRefs["notebook"]}
                    si="EQbwmOGt733oWkXF"
                    title="How to use the Notebook editor?"
                  />
                  <Text>
                    {jt`Filter and summarize data, add custom columns, join data from other tables, and more - ${(<b>{t`all without SQL`}</b>)}. And when you build a chart with the query builder, people will be able to ${(
                      <b>{t`drill-through the chart`}</b>
                    )} to explore the data further.`}
                  </Text>
                  <Link
                    to={newQuestionUrl}
                    onClick={() => trackChecklistItemCTAClicked("notebook")}
                  >
                    <Button variant="outline">{t`New question`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="sql">
              <Accordion.Control icon={<Icon name="sql" />}>
                {t`Query with SQL`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="_iiG_MoxdAE"
                    ref={iframeRefs["sql"]}
                    si="QInRPzkHpFamjsHw"
                    title="How to use the SQL/Native query editor?"
                  />
                  <Text>
                    {jt`Use the ${(<b>{t`native query editor`}</b>)} to query data with SQL or the query language native to your database. You can insert variables in your code to create ${
                      showMetabaseLinks ? (
                        <ExternalLink href="https://www.metabase.com/docs/latest/questions/native-editor/sql-parameters">{t`SQL templates`}</ExternalLink>
                      ) : (
                        t`SQL templates`
                      )
                    }, and reference the results of models or other saved question in your code.`}
                  </Text>
                  <Link
                    to={newNativeQuestionUrl}
                    onClick={() => trackChecklistItemCTAClicked("sql")}
                  >
                    <Button variant="outline">{t`New native query`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="dashboard">
              <Accordion.Control icon={<Icon name="dashboard" />}>
                {t`Create and share a dashboard`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <img
                    alt={`${applicationName} dashboard with tabs`}
                    loading="lazy"
                    src="app/assets/img/onboarding_dashboard_tabs.png"
                    srcSet="app/assets/img/onboarding_dashboard_tabs@2x.png 2x"
                    width="100%"
                  />
                  <Text>
                    {jt`You can organize questions into a ${
                      showMetabaseLinks ? (
                        <ExternalLink href="https://www.metabase.com/docs/latest/dashboards/introduction#dashboard-tabs">{t`dashboard with tabs`}</ExternalLink>
                      ) : (
                        t`dashboard with tabs`
                      )
                    } and add text cards.`}
                  </Text>
                  <img
                    alt={`${applicationName} dashboard with filters`}
                    loading="lazy"
                    src="app/assets/img/onboarding_dashboard_filters.png"
                    srcSet="app/assets/img/onboarding_dashboard_filters@2x.png 2x"
                    width="100%"
                  />
                  <Text>
                    {jt`You can add ${(<b>{t`filters`}</b>)} to dashboards and connect them to fields on questions to narrow the results.`}
                  </Text>
                  <VideoTutorial
                    id="dVNB-xJW0CY"
                    ref={iframeRefs["dashboard"]}
                    title="How to use dashboards?"
                  />
                  <Text>
                    {t`You can drill-through your dashboard and charts to see more detailed data underneath.`}
                  </Text>
                  <Link
                    to="/dashboard/1"
                    onClick={() => trackChecklistItemCTAClicked("dashboard")}
                  >
                    <Button variant="outline">{t`Edit a sample dashboard`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>
          <Box mb={64}>
            <Title order={2} mb={24}>{t`Get email updates and alerts`}</Title>
            <Accordion.Item value="subscription">
              <Accordion.Control icon={<Icon name="subscription" />}>
                {t`Get dashboard updates by email`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="8zjKBpDTEzI"
                    ref={iframeRefs["subscription"]}
                    si="9fgftfrqN67Wm7rB"
                    title="How to create a dashboard email subscription?"
                  />
                  {shouldConfigureCommunicationChannels && (
                    <Text>
                      {jt`${(<Link to="/admin/settings/email/smtp">{t`Set up email`}</Link>)} or ${(<Link to="/admin/settings/notifications">{t`Slack`}</Link>)} first.`}
                    </Text>
                  )}
                  <Text>
                    {jt`To set up a subscription to a dashboard, click on the ${(<Icon name="subscription" className={S.inlineIcon} />)} ${(<i>{t`subscriptions`}</i>)} icon on the top bar. On a sidebar on the right set up a dashboard subscription via email or Slack.`}
                  </Text>
                  <Link
                    to="/dashboard/1"
                    onClick={() => trackChecklistItemCTAClicked("subscription")}
                  >
                    <Button variant="outline">{t`Set up subscriptions for a sample dashboard`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="alert">
              <Accordion.Control icon={<Icon name="alert" />}>
                {t`Get alerts when metrics behave unexpectedly`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="MIUH3BsvIeA"
                    ref={iframeRefs["alert"]}
                    si="tbnZoSLJ7eZNOeXx"
                    title="How to create an alert?"
                  />
                  {shouldConfigureCommunicationChannels && (
                    <Text>
                      {jt`${(<Link to="/admin/settings/email/smtp">{t`Set up email`}</Link>)} or ${(<Link to="/admin/settings/notifications">{t`Slack`}</Link>)} first.`}
                    </Text>
                  )}
                  <Text>
                    {jt`Go to a question and click on the ${(<Icon name="alert" className={S.inlineIcon} />)} ${(<i>{t`bell`}</i>)} icon in the bottom right of the screen.`}
                  </Text>
                  <Text>
                    {t`There are three kinds of things you can get alerted about in ${applicationName}:`}
                    <ul className={S.list}>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink href="https://www.metabase.com/docs/latest/questions/sharing/alerts#goal-line-alerts">{t`Goal line alerts`}</ExternalLink>
                        ) : (
                          t`Goal line alerts`
                        )
                      }: when a time series crosses a goal line.`}</li>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink href="https://www.metabase.com/docs/latest/questions/sharing/alerts#progress-bar-alerts">{t`Progress bar alerts`}</ExternalLink>
                        ) : (
                          t`Progress bar alerts`
                        )
                      }: when a progress bar reaches or goes below its goal.`}</li>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink href="https://www.metabase.com/docs/latest/questions/sharing/alerts#results-alerts">{t`Results alerts`}</ExternalLink>
                        ) : (
                          t`Results alerts`
                        )
                      }: when a question returns any result.`}</li>
                    </ul>
                  </Text>
                  <Link
                    to="/question/12"
                    onClick={() => trackChecklistItemCTAClicked("alert")}
                  >
                    <Button variant="outline">{t`Set up alert for a sample question`}</Button>
                  </Link>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>
        </Accordion>
        {showMetabaseLinks && (
          <Box mb={32}>
            <Title
              order={2}
              mb={12}
            >{t`Get the most out of ${applicationName}`}</Title>
            <Text>
              {t`There are more tutorials and guides to explore.`}
              <br />
              {jt`${(
                <ExternalLink href="https://www.youtube.com/playlist?list=PLzmftu0Z5MYGY0aA3rgIGwSCifECMeuG6">{t`Click here to continue learning`}</ExternalLink>
              )} about data visualization, modeling, and other advanced topics.`}
            </Text>
          </Box>
        )}
        {shouldShowSupport && (
          <Box p={24} className={S.support}>
            <Stack spacing={4}>
              <Title order={4}>{t`Need to talk with someone?`}</Title>
              <Text>{t`Reach out to engineers who can help with technical troubleshooting. Not your typical support agents.`}</Text>
            </Stack>
            <Link to="mailto:help@metabase.com" key="support">
              <Button variant="filled">{t`Contact Support`}</Button>
            </Link>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const VideoTutorial = forwardRef(function VideoTutorial(
  { id, si, title }: { id: string; si?: string; title: string },
  ref: Ref<HTMLIFrameElement>,
) {
  return (
    <iframe
      className={S.video}
      loading="lazy"
      ref={ref}
      src={`https://www.youtube.com/embed/${id}?si=${si}&enablejsapi=1`}
      title={title}
    />
  );
});
