import {
  type Ref,
  createRef,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { jt, t } from "ttag";

import { useSetting, useTempStorage } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { getIsXrayEnabled } from "metabase/home/selectors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  getDocsUrl,
  getIsPaidPlan,
  getSetting,
} from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { getIsHosted } from "metabase/setup/selectors";
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
  const isPaidPlan = useSelector(getIsPaidPlan);

  const isHosted = useSelector(getIsHosted);
  const shouldConfigureCommunicationChannels = !isHosted;

  const isXrayEnabled = useSelector(getIsXrayEnabled);

  const exampleDashboardId = useSetting("example-dashboard-id");

  const iframeRefs = useMemo(() => {
    return {
      "x-ray": createRef<HTMLIFrameElement>(),
      notebook: createRef<HTMLIFrameElement>(),
      sql: createRef<HTMLIFrameElement>(),
      dashboard: createRef<HTMLIFrameElement>(),
      subscription: createRef<HTMLIFrameElement>(),
      alert: createRef<HTMLIFrameElement>(),
    };
  }, []);

  type IframeKeys = keyof typeof iframeRefs;

  const isValidIframeKey = useCallback(
    (key: ChecklistItemValue | null): key is IframeKeys => {
      return key !== null && Object.keys(iframeRefs).includes(key);
    },
    [iframeRefs],
  );

  const [itemValue, setItemValue] = useState<ChecklistItemValue | null>(null);

  const DEFAULT_ITEM = "database";

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

  const sendMessage = (command: string, value: IframeKeys) => {
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

  const [lastItemOpened, setLastItemOpened] = useTempStorage(
    "last-opened-onboarding-checklist-item",
  );

  useEffect(() => {
    if (lastItemOpened && isValidIframeKey(lastItemOpened)) {
      iframeRefs[lastItemOpened]?.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [iframeRefs, lastItemOpened, isValidIframeKey]);

  const stopVideo = (key: IframeKeys) => sendMessage("stopVideo", key);

  const handleValueChange = (newValue: ChecklistItemValue | null) => {
    if (isValidIframeKey(itemValue)) {
      stopVideo(itemValue);
    }

    if (newValue !== null) {
      setLastItemOpened(newValue);
      trackChecklistItemExpanded(newValue);
    }

    setItemValue(newValue);
  };

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const utmTags = {
    utm_source: "product",
    utm_medium: "docs",
    utm_campaign: "help",
    utm_content: "getting-started",
    source_plan: plan,
  };

  const sqlParamsDocsLink = useSelector(state =>
    getDocsUrl(state, {
      page: "questions/native-editor/sql-parameters",
    }),
  );
  const dashboardTabsDocsLink = useSelector(state =>
    getDocsUrl(state, {
      page: "dashboards/introduction",
      anchor: "dashboard-tabs",
    }),
  );
  const goalLineAlertDocsLink = useSelector(state =>
    getDocsUrl(state, {
      page: "questions/sharing/alerts",
      anchor: "goal-line-alerts",
    }),
  );
  const progressBarAlertDocsLink = useSelector(state =>
    getDocsUrl(state, {
      page: "questions/sharing/alerts",
      anchor: "progress-bar-alerts",
    }),
  );
  const resultAlertDocsLink = useSelector(state =>
    getDocsUrl(state, {
      page: "questions/sharing/alerts",
      anchor: "results-alerts",
    }),
  );

  const getUTMLink = (url: string) => {
    const a = new URL(url);
    Object.entries(utmTags).forEach(([key, value]) => {
      a.searchParams.set(key, value);
    });

    return a.toString();
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
          defaultValue={lastItemOpened || DEFAULT_ITEM}
          classNames={{
            chevron: S.chevron,
            content: S.content,
            control: S.control,
            icon: S.icon,
            item: S.item,
            label: S.label,
          }}
          onChange={(value: ChecklistItemValue | null) =>
            handleValueChange(value)
          }
        >
          <Box mb={64}>
            <Title order={2} mb="lg">{t`Set up your ${applicationName}`}</Title>
            <Accordion.Item value="database" data-testid="database-item">
              <Accordion.Control icon={<Icon name="add_data" />}>
                {t`Connect to your database`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <img
                    alt={`${applicationName} data stack`}
                    className={S.image}
                    loading="lazy"
                    src="app/assets/img/onboarding_data_diagram.png"
                    srcSet="app/assets/img/onboarding_data_diagram@2x.png 2x"
                    width="100%"
                  />

                  <Text>
                    {t`You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor. ${applicationName} connects to more than 15 popular databases.`}
                  </Text>
                  <Box data-testid="database-cta">
                    <Link
                      to="/admin/databases/create"
                      onClick={() => trackChecklistItemCTAClicked("database")}
                    >
                      <Button variant="outline">{t`Add Database`}</Button>
                    </Link>
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="invite" data-testid="invite-item">
              <Accordion.Control icon={<Icon name="group" />}>
                {t`Invite people`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <img
                    alt={`Admin panel with the "Invite someone" button`}
                    className={S.image}
                    loading="lazy"
                    src="app/assets/img/onboarding_invite.png"
                    srcSet="app/assets/img/onboarding_invite@2x.png 2x"
                    width="100%"
                  />
                  {!isPaidPlan ? (
                    // eslint-disable-next-line no-literal-metabase-strings -- OSS doesn't have whitelabeling option
                    <Text>{t`Don't be shy with invites. Metabase makes self-service analytics easy.`}</Text>
                  ) : (
                    // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins
                    <Text>{t`Don't be shy with invites. Metabase Starter plan includes 5 users, and Pro includes 10 users without the need to pay additionally.`}</Text>
                  )}

                  <Group spacing={0} data-testid="invite-cta">
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
            <Title order={2} mb="lg">{t`Start visualizing your data`}</Title>
            <Accordion.Item value="x-ray" data-testid="x-ray-item">
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
                  {isXrayEnabled ? (
                    <>
                      <Text>
                        {jt`Hover over a table and click the yellow lightning bolt ${(
                          <Icon
                            c="var(--mb-color-warning)"
                            className={S.inlineIcon}
                            key="bolt_icon"
                            name="bolt_filled"
                            size={14}
                          />
                        )}. ${applicationName} will create a bunch of charts based on that data and arrange them on a dashboard.`}
                      </Text>
                      <Box data-testid="x-ray-cta">
                        <Link
                          to="/browse/databases"
                          onClick={() => trackChecklistItemCTAClicked("x-ray")}
                        >
                          <Button variant="outline">{t`Browse data`}</Button>
                        </Link>
                      </Box>
                    </>
                  ) : (
                    <Text>{t`You need to enable this feature first.`}</Text>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="notebook" data-testid="notebook-item">
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
                    {jt`Filter and summarize data, add custom columns, join data from other tables, and more - ${(
                      <b key="no-sql">{t`all without SQL`}</b>
                    )}. And when you build a chart with the query builder, people will be able to ${(
                      <b key="drill-through">{t`drill-through the chart`}</b>
                    )} to explore the data further.`}
                  </Text>
                  <Box data-testid="notebook-cta">
                    <Link
                      to={newQuestionUrl}
                      onClick={() => trackChecklistItemCTAClicked("notebook")}
                    >
                      <Button variant="outline">{t`New question`}</Button>
                    </Link>
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="sql" data-testid="sql-item">
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
                    {jt`Use the ${(
                      <b key="native">{t`native query editor`}</b>
                    )} to query data with SQL or the query language native to your database. You can insert variables in your code to create ${
                      showMetabaseLinks ? (
                        <ExternalLink
                          href={getUTMLink(sqlParamsDocsLink)}
                          key="sql-templates"
                        >
                          {t`SQL templates`}
                        </ExternalLink>
                      ) : (
                        t`SQL templates`
                      )
                    }, and reference the results of models or other saved question in your code.`}
                  </Text>
                  <Box data-testid="sql-cta">
                    <Link
                      to={newNativeQuestionUrl}
                      onClick={() => trackChecklistItemCTAClicked("sql")}
                    >
                      <Button variant="outline">{t`New native query`}</Button>
                    </Link>
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="dashboard" data-testid="dashboard-item">
              <Accordion.Control icon={<Icon name="dashboard" />}>
                {t`Create and filter a dashboard`}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack spacing="lg">
                  <VideoTutorial
                    id="FAst1nabBck"
                    ref={iframeRefs["dashboard"]}
                    si="yVMfXeh0tkr1Yt8_"
                    title="How to use dashboards?"
                  />
                  <Text>
                    {t`You can:`}
                    <ul className={S.list}>
                      <li>{jt`organize questions into a ${
                        showMetabaseLinks ? (
                          <ExternalLink
                            href={getUTMLink(dashboardTabsDocsLink)}
                            key="tabs"
                          >
                            {t`dashboard with tabs`}
                          </ExternalLink>
                        ) : (
                          t`dashboard with tabs`
                        )
                      } and add text cards.`}</li>
                      <li>{jt`add ${(<b key="filters">{t`filters`}</b>)} to dashboards and connect them to fields on questions to narrow the results.`}</li>
                      <li>{t`drill-through your dashboard and charts to see more detailed data underneath.`}</li>
                    </ul>
                  </Text>

                  {exampleDashboardId && (
                    <Box data-testid="dashboard-cta">
                      <Link
                        to={`/dashboard/${exampleDashboardId}`}
                        onClick={() =>
                          trackChecklistItemCTAClicked("dashboard")
                        }
                      >
                        <Button variant="outline">{t`Edit a sample dashboard`}</Button>
                      </Link>
                    </Box>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>
          <Box mb={64}>
            <Title order={2} mb="lg">{t`Get email updates and alerts`}</Title>
            <Accordion.Item
              value="subscription"
              data-testid="subscription-item"
            >
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
                    <Text data-testid="subscription-communication-setup">
                      {jt`${(
                        <Link
                          key="subscription-email"
                          to="/admin/settings/email/smtp"
                        >{t`Set up email`}</Link>
                      )} or ${(
                        <Link
                          key="subscription-slack"
                          to="/admin/settings/notifications"
                        >{t`Slack`}</Link>
                      )} first.`}
                    </Text>
                  )}
                  <Text>
                    {jt`To set up a subscription to a dashboard, click on the ${(
                      <Icon
                        key="sharing-icon"
                        name="share"
                        className={S.inlineIcon}
                      />
                    )} ${(
                      <i key="sharing">{t`sharing`}</i>
                    )} icon on the top bar, then click on ${(
                      <Icon
                        key="subscription-icon"
                        name="subscription"
                        className={S.inlineIcon}
                      />
                    )} ${(
                      <b key="subscriptions">{t`Subscriptions`}</b>
                    )}. On a sidebar on the right set up a dashboard subscription via email or Slack.`}
                  </Text>
                  {exampleDashboardId && (
                    <Box data-testid="subscription-cta">
                      <Link
                        to="/dashboard/1"
                        onClick={() =>
                          trackChecklistItemCTAClicked("subscription")
                        }
                      >
                        <Button variant="outline">{t`Set up subscriptions for a sample dashboard`}</Button>
                      </Link>
                    </Box>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="alert" data-testid="alert-item">
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
                    <Text data-testid="alert-communication-setup">
                      {jt`${(
                        <Link
                          key="alert-email"
                          to="/admin/settings/email/smtp"
                        >{t`Set up email`}</Link>
                      )} or ${(
                        <Link
                          key="alert-slack"
                          to="/admin/settings/notifications"
                        >{t`Slack`}</Link>
                      )} first.`}
                    </Text>
                  )}
                  <Text>
                    {jt`Go to a question and click on the ${(
                      <Icon
                        key="sharing-icon"
                        name="share"
                        className={S.inlineIcon}
                      />
                    )} icon on the top bar, then ${(
                      <Icon
                        className={S.inlineIcon}
                        key="alert-icon"
                        name="alert"
                      />
                    )} ${(<b key="create-alert">{t`Create alert`}</b>)}.`}
                  </Text>
                  <Text>
                    {t`There are three kinds of things you can get alerted about in ${applicationName}:`}
                    <ul className={S.list}>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink
                            href={getUTMLink(goalLineAlertDocsLink)}
                            key="goal"
                          >{t`Goal line alerts`}</ExternalLink>
                        ) : (
                          t`Goal line alerts`
                        )
                      }: when a time series crosses a goal line.`}</li>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink
                            href={getUTMLink(progressBarAlertDocsLink)}
                            key="progress"
                          >
                            {t`Progress bar alerts`}
                          </ExternalLink>
                        ) : (
                          t`Progress bar alerts`
                        )
                      }: when a progress bar reaches or goes below its goal.`}</li>
                      <li>{jt`${
                        showMetabaseLinks ? (
                          <ExternalLink
                            href={getUTMLink(resultAlertDocsLink)}
                            key="results"
                          >{t`Results alerts`}</ExternalLink>
                        ) : (
                          t`Results alerts`
                        )
                      }: when a question returns any result.`}</li>
                    </ul>
                  </Text>
                  {/* If the example dashboard is not available, there's a high chance that this question isn't either */}
                  {exampleDashboardId && (
                    <Box data-testid="alert-cta">
                      <Link
                        // The product decision was to hard code this question id, since we don't have the
                        // mechanism to obtain it programmatically. In the worst case scenario,
                        // a user will land on a page that doesn't exist.
                        to="/question/12"
                        onClick={() => trackChecklistItemCTAClicked("alert")}
                      >
                        <Button variant="outline">{t`Set up alert for a sample question`}</Button>
                      </Link>
                    </Box>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Box>
        </Accordion>
        {(showMetabaseLinks || isPaidPlan) && (
          <Box component="footer">
            {showMetabaseLinks && (
              <Box data-testid="learning-section" mb="xl">
                <Title
                  order={2}
                  mb={12}
                >{t`Get the most out of ${applicationName}`}</Title>
                <Text>
                  {t`There are more tutorials and guides to explore.`}
                  <br />
                  {jt`${(
                    <ExternalLink
                      href="https://www.youtube.com/playlist?list=PLzmftu0Z5MYGY0aA3rgIGwSCifECMeuG6"
                      key="playlist"
                    >{t`Click here to continue learning`}</ExternalLink>
                  )} about data visualization, modeling, and other advanced topics.`}
                </Text>
              </Box>
            )}
            {isPaidPlan && (
              <Box className={S.support} data-testid="help-section" p="lg">
                <Stack spacing="xs">
                  <Title order={4}>{t`Need to talk with someone?`}</Title>
                  <Text>{t`Reach out to engineers who can help with technical troubleshooting. Not your typical support agents.`}</Text>
                </Stack>
                <Link to="mailto:help@metabase.com" key="help">
                  <Button variant="filled">{t`Get Help`}</Button>
                </Link>
              </Box>
            )}
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
      allowFullScreen
      className={S.video}
      loading="lazy"
      ref={ref}
      src={`https://www.youtube.com/embed/${id}?si=${si}&rel=0&enablejsapi=1`}
      title={title}
    />
  );
});
