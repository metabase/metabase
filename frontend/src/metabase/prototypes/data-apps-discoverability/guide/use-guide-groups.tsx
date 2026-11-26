/* eslint-disable ttag/no-module-declaration, metabase/no-literal-metabase-strings -- PROTOTYPE: the guide's copy is plain English until a layout is picked. */
import type { ReactNode } from "react";
import { useMemo } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Code } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import {
  Caution,
  Prose,
  Snippet,
  SubstepWithSnippet,
  Substeps,
} from "./blocks";

export interface GuideStepAction {
  label: string;
  to: string;
}

export interface GuideStep {
  id: string;
  icon: IconName;
  title: string;
  /** One line that says why the step exists. Shown where the step is collapsed. */
  summary: string;
  body: ReactNode;
  action?: GuideStepAction;
}

export interface GuideGroup {
  id: string;
  title: string;
  description: string;
  steps: GuideStep[];
}

const REMOTE_SYNC_SETTINGS_URL = "/admin/settings/remote-sync";

/**
 * The steps you can't skip on the way to a first data app, in the order you do them. The copy follows the
 * "Getting started with data apps" docs page, which builds on a single Metabase.
 */
export function useGuideGroups(): GuideGroup[] {
  // The address the admin is using right now, which is the one the CLI has to reach.
  const siteUrl = window.location.origin;
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: remoteSyncDocsUrl } = useDocsUrl(
    "data-modeling/semantic-layer/remote-sync",
  );
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: cliDocsUrl } = useDocsUrl(
    "installation-and-operation/metabase-cli",
  );

  return useMemo(
    () => [
      {
        id: "tools",
        title: "Set up your tools",
        description: "You only do these steps once.",
        steps: [
          {
            id: "node",
            icon: "gear",
            title: "Install Node.js",
            summary:
              "The Metabase CLI and your app's build both run on Node.js.",
            body: (
              <>
                <Prose>
                  Install <ExternalLink href="https://nodejs.org/">Node.js</ExternalLink>{" "}
                  22.12 or later. To check which version you have, run:
                </Prose>
                <Snippet code="node --version" />
              </>
            ),
          },
          {
            id: "cli",
            icon: "sql",
            title: "Install the Metabase CLI and log in",
            summary:
              "Your agent works with this Metabase through the mb command.",
            body: (
              <Substeps>
                {[
                  <SubstepWithSnippet
                    key="install"
                    code="npm install -g @metabase/cli"
                  >
                    Install the CLI. If you already have the CLI, run{" "}
                    <Code>mb upgrade</Code> instead.
                  </SubstepWithSnippet>,
                  <SubstepWithSnippet
                    key="login"
                    code={`mb auth login --url ${siteUrl}`}
                  >
                    Log the CLI in to this Metabase.
                  </SubstepWithSnippet>,
                  <span key="approve">
                    The CLI offers to open Metabase in your browser. Sign in
                    with your admin account, and approve the CLI.
                  </span>,
                ]}
              </Substeps>
            ),
          },
          {
            id: "skill",
            icon: "bolt",
            title: "Add the metabase-cli skill to your agent",
            summary:
              "One skill teaches your agent how to use the CLI and build data apps.",
            body: (
              <>
                <Prose>
                  The metabase-cli skill tells your agent to use the CLI, and
                  to load the skills that come with the CLI, including the
                  skills for building data apps. To add the skill to Claude
                  Code, run:
                </Prose>
                <Snippet code="npx skills add metabase/agent-skills --skill metabase-cli -a claude-code" />
                <Prose>
                  Using another agent? Take a look at{" "}
                  <ExternalLink href={cliDocsUrl}>
                    the other ways to install the skill
                  </ExternalLink>
                  . If you can&apos;t add the skill at all, tell your agent to
                  run <Code>mb skills get data-app</Code> before it starts on
                  the app.
                </Prose>
              </>
            ),
          },
          {
            id: "semantic-layer",
            icon: "table2",
            title: "Publish tables to your semantic layer",
            summary:
              "A data app can only read the tables and metrics you've vetted.",
            body: (
              <>
                <Prose>
                  The semantic layer is your set of curated tables and metrics:
                  the data that you&apos;ve checked, and that people and AI
                  should use. Your agent builds the app on those tables, so the
                  app shows the same numbers as the rest of your Metabase.
                </Prose>
                <Substeps>
                  {[
                    <span key="open">
                      Click the <strong>grid</strong> icon in the upper right,
                      and select <strong>Data studio</strong>.
                    </span>,
                    <span key="create">
                      In the left sidebar, click <strong>Semantic layer</strong>
                      . If Metabase asks you to create your semantic layer,
                      click <strong>Create my semantic layer</strong>.
                    </span>,
                    <span key="check">
                      Look in the <strong>Data</strong> section for the tables
                      that your app needs, and publish any that are missing.
                    </span>,
                  ]}
                </Substeps>
                <Prose>
                  Your agent can also create your semantic layer and publish
                  tables for you, but only if you ask.
                </Prose>
              </>
            ),
            action: {
              label: "Open the semantic layer",
              to: Urls.dataStudioLibrary(),
            },
          },
          {
            id: "repository",
            icon: "git_branch",
            title: "Connect Metabase to a Git repository",
            summary:
              "Metabase gets your app from a repository, which also keeps each version of the app's code.",
            body: (
              <>
                <Prose>
                  Skip this step if this Metabase already syncs with a Git
                  repository. Metabase connects to a repository with a feature
                  called{" "}
                  <ExternalLink href={remoteSyncDocsUrl}>
                    Remote sync
                  </ExternalLink>
                  . Choose a mode first, because each mode needs a different
                  access token. In <strong>Read-only</strong> mode, Metabase
                  only reads from the repository, which is what you want for a
                  Metabase that people rely on. In <strong>Read-write</strong>{" "}
                  mode, Metabase can also write to the repository, which is
                  handy if you&apos;re only trying out data apps.
                </Prose>
                <Substeps>
                  {[
                    <span key="create">
                      Create a new repository on GitHub, GitLab, or Bitbucket,
                      and initialize it with a README file.
                    </span>,
                    <span key="token">
                      Create an access token for the repository, for the mode
                      that you chose.
                    </span>,
                    <span key="settings">
                      Go to <strong>Admin</strong> &gt;{" "}
                      <strong>Settings</strong> &gt;{" "}
                      <strong>Remote sync</strong>.
                    </span>,
                    <span key="fill">
                      Enter the repository&apos;s URL in{" "}
                      <strong>Repository URL</strong>, select your mode, and
                      paste the token in <strong>Access Token</strong>.
                    </span>,
                    <span key="save">
                      Click <strong>Set up remote sync</strong>.
                    </span>,
                  ]}
                </Substeps>
                <Caution>
                  Anyone who can push to the repository can change the content
                  in your Metabase, so give write access only to people that
                  you trust as admins.
                </Caution>
              </>
            ),
            action: {
              label: "Open Remote sync settings",
              to: REMOTE_SYNC_SETTINGS_URL,
            },
          },
          {
            id: "clone",
            icon: "download",
            title: "Clone the repository",
            summary:
              "Your agent works in a local clone, on the branch that Metabase pulls from.",
            body: (
              <>
                <Prose>
                  Clone the repository to your computer, and change into its
                  directory. Use your repository&apos;s URL:
                </Prose>
                <Snippet
                  code={
                    "git clone https://github.com/your-org/your-repo\ncd your-repo"
                  }
                />
                <Prose>
                  Stay on the branch that Metabase pulls from. To find that
                  branch, look at <strong>Sync branch</strong> in the Remote
                  sync settings. It&apos;s probably <Code>main</Code>.
                </Prose>
              </>
            ),
          },
        ],
      },
      {
        id: "build",
        title: "Build the app",
        description: "From here on, your agent does most of the typing.",
        steps: [
          {
            id: "ask",
            icon: "ai",
            title: "Ask your agent for the app",
            summary:
              "Describe the result you want, in terms of your published tables.",
            body: (
              <>
                <Prose>
                  Start your agent in the folder of your clone, and describe
                  the app. For example:
                </Prose>
                <Snippet code="Create a Metabase data app that shows our orders by month, and a table of the latest orders. Make it look cool." />
                <Prose>
                  The agent writes the app&apos;s code in{" "}
                  <Code>{"data_apps/<slug>/"}</Code>, where{" "}
                  <Code>{"<slug>"}</Code> is the app&apos;s short name, and
                  starts a preview. Describe the result, not the SQL: an app
                  can&apos;t run SQL, so ask for revenue by month for each
                  product category instead of pasting a query.
                </Prose>
                <Prose>
                  If the app needs a table or a metric that isn&apos;t in your
                  semantic layer, the agent stops and tells you what&apos;s
                  missing. The agent also runs commands on your computer, like{" "}
                  <Code>mb</Code>, <Code>npm</Code>, and <Code>git</Code>, and
                  might ask for your permission first.
                </Prose>
              </>
            ),
          },
          {
            id: "preview",
            icon: "eye",
            title: "Preview the app",
            summary:
              "The preview runs on your computer, with data from this Metabase.",
            body: (
              <>
                <Prose>
                  The agent starts the preview at a <Code>localhost</Code>{" "}
                  address. Open the preview in your browser, and keep the tab
                  open while the agent works: the agent reads the app&apos;s
                  errors from the open preview. Ask for changes until the app
                  looks the way you want.
                </Prose>
                <Prose>
                  The preview gets its data with an admin API key, so the
                  preview shows what an admin can see, not what the app&apos;s
                  viewers can see. The agent asks before it creates the key,
                  and deletes the key when it&apos;s done.
                </Prose>
                <Caution>
                  If your session ends before the agent deletes the key, delete
                  the key yourself. The key&apos;s name starts with{" "}
                  <Code>data-app</Code>.
                </Caution>
              </>
            ),
          },
          {
            id: "ship",
            icon: "rocket",
            title: "Ship the app",
            summary:
              "Your agent pushes the app to your repository, and Metabase pulls it from there.",
            body: (
              <>
                <Prose>When the app is ready, tell your agent:</Prose>
                <Snippet code="Ship the app to my Metabase." />
                <Prose>
                  The agent builds the app, commits the app to the branch that
                  Metabase pulls from, pushes the branch, and pulls the branch
                  into Metabase. That pull is what creates the app here. Until
                  then, the app is only files in your clone.
                </Prose>
                <Prose>Then open the app at:</Prose>
                <Snippet code={`${siteUrl}/apps/<slug>`} />
              </>
            ),
          },
        ],
      },
      {
        id: "share",
        title: "Share the app",
        description: "Until you add groups, only admins can open the app.",
        steps: [
          {
            id: "groups",
            icon: "group",
            title: "Choose who can open the app",
            summary:
              "Add the groups that should see the app, and check that they can see its data.",
            body: (
              <>
                <Substeps>
                  {[
                    <span key="open">
                      Click the <strong>grid</strong> icon in the upper right,
                      and select <strong>Data studio</strong>.
                    </span>,
                    <span key="app">
                      Click <strong>Data apps</strong>, and click the app.
                    </span>,
                    <span key="groups">
                      On the <strong>Permissions</strong> tab, add the groups
                      that can open the app.
                    </span>,
                    <span key="access">
                      Check the <strong>Data access</strong> column. If it says{" "}
                      <strong>Missing N tables</strong>, give the group access
                      to those tables.
                    </span>,
                  ]}
                </Substeps>
                <Prose>
                  The app runs with the data permissions of the person who
                  opens it, so people see only the data that they&apos;re
                  allowed to see.
                </Prose>
              </>
            ),
            action: {
              label: "Open data apps",
              to: Urls.dataStudioDataApps(),
            },
          },
        ],
      },
    ],
    [siteUrl, remoteSyncDocsUrl, cliDocsUrl],
  );
}
