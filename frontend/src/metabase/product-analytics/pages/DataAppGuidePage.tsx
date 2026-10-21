/* eslint-disable metabase/no-literal-metabase-strings -- A developer guide that names Metabase products and packages (the SDK, Remote Sync, the MCP server), which don't take the whitelabeled name. */
import type { ReactNode } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { Link } from "metabase/common/components/Link";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useSetting } from "metabase/settings";
import {
  Badge,
  Box,
  Card,
  Code,
  Group,
  Icon,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./DataAppGuidePage.module.css";

const PAGE_MAX_WIDTH = 860;
const EXAMPLE_SLUG = "sales-overview";
// Matches the command on the data apps admin page.
const INSTALL_SKILL_COMMAND =
  "npx skills add metabase/agent-skills/skills/metabase-data-apps/v1 \\\n  --skill metabase-data-apps";
const DEV_SERVER_URL = "http://localhost:5174";

const ADMIN_URLS = {
  remoteSync: "/admin/settings/remote-sync",
  apiKeys: "/admin/settings/authentication/api-keys",
  mcp: "/admin/metabot/mcp",
  embeddingSecurity: "/admin/embedding/security",
  apps: "/admin/settings/apps",
};

export const DataAppGuidePage = () => {
  usePageTitle(t`Build a data app`);
  const siteUrl = useSetting("site-url") ?? window.location.origin;
  const mcpUrl = `${siteUrl}/api/metabase-mcp`;

  return (
    <Box className={S.page}>
      <Stack maw={PAGE_MAX_WIDTH} mx="auto" px="xl" py="3rem" gap="3rem">
        <Intro />
        <HowItWorks />
        <Prerequisites />
        <Stack gap="lg">
          <Title order={2}>{t`Set up your first data app`}</Title>
          <SetupStep
            number={1}
            title={t`Connect a Git repository with Remote Sync`}
          >
            <Text>
              {t`Every data app lives in its own folder, data_apps/<app-name>/, inside the Git repository this Metabase syncs with. Metabase reads each app's data_app.yaml manifest and serves its built bundle straight from that repository.`}
            </Text>
            <Text>
              {t`If you haven't connected one yet, create an empty repository, then connect it in Read-write mode.`}{" "}
              <AdminLink to={ADMIN_URLS.remoteSync}>
                {t`Open Remote Sync settings`}
              </AdminLink>
            </Text>
          </SetupStep>

          <SetupStep
            number={2}
            title={t`Create an API key for local development`}
          >
            <Text>
              {t`The local preview talks to this Metabase with an API key. Create one in the Administrators group, then put it in a .env.local file at the root of your repository. Never commit that file.`}{" "}
              <AdminLink
                to={ADMIN_URLS.apiKeys}
              >{t`Create an API key`}</AdminLink>
            </Text>
            <CodeSnippet
              code={`DATA_APP_MB_URL=${siteUrl}\nDATA_APP_MB_API_KEY=<your API key>`}
            />
          </SetupStep>

          <SetupStep
            number={3}
            title={t`Give your coding agent the data app skills`}
          >
            <Text>
              {t`Data apps are built in code, and they're easiest to build with an AI coding agent like Claude Code or Cursor. Metabase publishes a skill that teaches the agent the whole workflow: scaffolding, querying your data, multiple pages, and actions. Run this from your repository:`}
            </Text>
            <CodeSnippet code={INSTALL_SKILL_COMMAND} />
          </SetupStep>

          <SetupStep
            number={4}
            title={t`Connect your agent to Metabase over MCP`}
            isOptional
          >
            <Text>
              {t`With Metabase's MCP server, your agent can browse your tables, metrics, and saved questions while it designs the app, instead of guessing at your data model. An admin turns the server on first.`}{" "}
              <AdminLink to={ADMIN_URLS.mcp}>{t`Open MCP settings`}</AdminLink>
            </Text>
            <Text>{t`Then add the server to your agent. For Claude Code:`}</Text>
            <CodeSnippet
              code={`claude mcp add --scope user --transport http metabase ${mcpUrl}`}
            />
            <Text c="text-secondary" fz="sm">
              {t`Run /mcp in Claude Code and choose Authenticate to sign in to Metabase. Other MCP clients connect to the same URL and sign in with OAuth.`}
            </Text>
          </SetupStep>

          <SetupStep number={5} title={t`Ask your agent to scaffold the app`}>
            <Text>
              {t`The agent copies the official template into data_apps/<app-name>/, installs the Metabase SDK, and writes the app's data_app.yaml manifest and its collection. App names become URLs, so use lowercase letters, numbers, and dashes.`}
            </Text>
            <CodeSnippet
              code={`Create a Metabase data app called ${EXAMPLE_SLUG} for our sales team.`}
              isWrapped
            />
          </SetupStep>

          <SetupStep number={6} title={t`Preview it locally`}>
            <Text>
              {t`From the app's folder, start the dev server. The preview runs your app against this Metabase inside the same sandbox Metabase uses in production, and rebuilds whenever you save.`}
            </Text>
            <CodeSnippet code={`cd data_apps/${EXAMPLE_SLUG}\nnpm run dev`} />
            <Text c="text-secondary" fz="sm">
              {t`If the preview at ${DEV_SERVER_URL} hits a CORS error, add that address to the allowed origins for the embedded analytics SDK.`}{" "}
              <AdminLink to={ADMIN_URLS.embeddingSecurity}>
                {t`Open embedding security`}
              </AdminLink>
            </Text>
          </SetupStep>

          <SetupStep number={7} title={t`Build the screens with your data`}>
            <Text>
              {t`Describe what you want and let the agent do the wiring. Apps read the tables, metrics, measures, and segments published to your Library through a typed schema, run saved actions for writes, and can have several pages.`}
            </Text>
            <ExamplePrompts />
          </SetupStep>

          <SetupStep number={8} title={t`Ship it`}>
            <Text>
              {t`Build the bundle, then commit the app's folder, including the lockfile and the built dist/index.js, along with its collection under collections/data_apps/. Push, then choose Pull changes in Metabase's Remote Sync settings.`}
            </Text>
            <CodeSnippet
              code={`npm run build\ngit add data_apps/${EXAMPLE_SLUG} collections/data_apps\ngit commit -m "Add ${EXAMPLE_SLUG} data app"\ngit push`}
            />
            <Text>
              {t`Last, in the data apps settings, turn the app on and choose which groups can open it. It opens at /apps/${EXAMPLE_SLUG}, and people see only the data their permissions already allow.`}{" "}
              <AdminLink
                to={ADMIN_URLS.apps}
              >{t`Open data apps settings`}</AdminLink>
            </Text>
          </SetupStep>
        </Stack>
        <GoodToKnow />
      </Stack>
    </Box>
  );
};

const Intro = () => (
  <Stack gap="md">
    <Group gap="sm">
      <Icon name="dashboard" c="brand" size={20} />
      <Text c="brand" fw="bold">{t`Data apps`}</Text>
    </Group>
    <Title order={1}>{t`Build a data app`}</Title>
    <Text fz="lg" c="text-secondary">
      {t`Data apps are custom React apps that run inside Metabase, on your Metabase data. Use them when a dashboard isn't enough: tools for your team, workflows that write data back, or anything with its own layout and logic.`}
    </Text>
  </Stack>
);

const HOW_IT_WORKS: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "string",
    get title() {
      return t`Build in code`;
    },
    get description() {
      return t`You or your coding agent write a React app with the Metabase SDK, and preview it against this Metabase.`;
    },
  },
  {
    icon: "git_branch",
    get title() {
      return t`Keep it in Git`;
    },
    get description() {
      return t`The app's source and its built bundle live in the repository Metabase syncs with.`;
    },
  },
  {
    icon: "share",
    get title() {
      return t`Use it in Metabase`;
    },
    get description() {
      return t`After a sync, Metabase serves the app at /apps/<app-name> to the groups you choose, sandboxed and scoped to each person's permissions.`;
    },
  },
];

const HowItWorks = () => (
  <Stack gap="lg">
    <Title order={2}>{t`How it works`}</Title>
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
      {HOW_IT_WORKS.map(({ icon, title, description }) => (
        <Card key={title} withBorder shadow="none" p="lg">
          <Stack gap="sm">
            <Icon name={icon} c="brand" size={20} />
            <Text fw="bold">{title}</Text>
            <Text c="text-secondary">{description}</Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  </Stack>
);

const Prerequisites = () => (
  <Card withBorder shadow="none" p="lg" bg="background-secondary">
    <Stack gap="sm">
      <Text fw="bold">{t`Before you start`}</Text>
      <List spacing="xs">
        <List.Item>
          {t`Admin access to a Metabase plan that includes Remote Sync and data apps (in beta).`}
        </List.Item>
        <List.Item>{t`A Git repository you can push to.`}</List.Item>
        <List.Item>
          {t`Node.js on your computer, and a coding agent such as Claude Code or Cursor.`}
        </List.Item>
        <List.Item>
          {t`Ideally, a development Metabase to build in, with production pulling finished apps through Remote Sync in Read-only mode.`}
        </List.Item>
      </List>
    </Stack>
  </Card>
);

const EXAMPLE_PROMPTS = [
  `Show monthly revenue from the Revenue metric as a line chart, with a date range filter and a table of the top 10 accounts below it.`,
  `Add a second page with a customer lookup: search by name, then show their orders and open support tickets.`,
  `Add a form that updates an account's renewal date using the "Update account" action, and refresh the table afterwards.`,
];

const ExamplePrompts = () => (
  <Stack gap="xs">
    <Text fw="bold" fz="sm">{t`Example prompts`}</Text>
    {EXAMPLE_PROMPTS.map((prompt) => (
      <CodeSnippet key={prompt} code={prompt} isWrapped />
    ))}
  </Stack>
);

const GoodToKnow = () => (
  <Stack gap="md">
    <Title order={2}>{t`Good to know`}</Title>
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <Tip title={t`Apps run in a sandbox`}>
        {t`An app can only reach Metabase through the SDK. To call an outside API, list its origin under allowed_hosts in data_app.yaml.`}
      </Tip>
      <Tip title={t`Build on synced content`}>
        {t`Point apps at Library tables and metrics that are synced to Git, so the app keeps working when another Metabase imports the repository.`}
      </Tip>
      <Tip title={t`Commit the bundle`}>
        {t`Metabase serves the built file named in data_app.yaml straight from Git. If you forget to build and commit it, Metabase serves the old version.`}
      </Tip>
      <Tip title={t`Keep apps up to date`}>
        {t`When Metabase changes the data app contract, older apps show as Outdated and stop opening until they're migrated. The agent skills include a migration guide.`}
      </Tip>
    </SimpleGrid>
  </Stack>
);

const Tip = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card withBorder shadow="none" p="md">
    <Stack gap="xs">
      <Text fw="bold">{title}</Text>
      <Text c="text-secondary">{children}</Text>
    </Stack>
  </Card>
);

type SetupStepProps = {
  number: number;
  title: string;
  isOptional?: boolean;
  children: ReactNode;
};

const SetupStep = ({ number, title, isOptional, children }: SetupStepProps) => (
  <Group align="flex-start" gap="md" wrap="nowrap">
    <Box className={S.stepNumber}>{number}</Box>
    <Stack gap="sm" flex={1} miw={0} pt={2}>
      <Group gap="sm">
        <Title order={4}>{title}</Title>
        {isOptional && <Badge variant="light">{t`Optional`}</Badge>}
      </Group>
      {children}
    </Stack>
  </Group>
);

type CodeSnippetProps = {
  code: string;
  isWrapped?: boolean;
};

const CodeSnippet = ({ code, isWrapped }: CodeSnippetProps) => (
  <Box className={S.codeSnippet}>
    <Code
      block
      className={isWrapped ? S.wrappedCode : undefined}
      bg="transparent"
      p={0}
      flex={1}
      miw={0}
    >
      {code}
    </Code>
    <CopyButton value={code} className={S.copyButton} />
  </Box>
);

const AdminLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} variant="brand">
    {children}
  </Link>
);
