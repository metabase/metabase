/* eslint-disable metabase/no-literal-metabase-strings -- PROTOTYPE: the guide's copy is plain English until a layout is picked. */
import type { ReactNode } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Code, Image, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

import { Snippet } from "./blocks";

// PROTOTYPE: hotlinked from the docs site. A promoted page needs its own copy of the image in `assets/img`.
const EXAMPLE_IMAGE_URL =
  "https://www.metabase.com/docs/latest/data-apps/images/example-data-app.png";

const Heading = ({ children }: { children: ReactNode }) => (
  <Title order={2} fz="xl" mt="lg">
    {children}
  </Title>
);

const Subheading = ({ children }: { children: ReactNode }) => (
  <Title order={3} fz="md" mt="sm">
    {children}
  </Title>
);

const Paragraph = ({ children }: { children: ReactNode }) => (
  <Text c="text-primary" lh="1.5rem">
    {children}
  </Text>
);

export const SIMPLE_GUIDE_TITLE = "How to make a data app";

/**
 * PROTOTYPE: the shortest version of the guide. Headings, a sentence where one is needed, and the commands. It has
 * its own copy, because it says less than the other layouts, not the same thing in a simpler frame.
 */
export function SimpleGuideLayout() {
  return (
    <Box mih="100%" bg="background_page-primary" px="xl" pt="xxl" pb="6rem">
      <Stack gap="md" maw={592} mx="auto">
        <Title order={1} fz="1.75rem">
          {SIMPLE_GUIDE_TITLE}
        </Title>
        <SimpleGuideBody />
      </Stack>
    </Box>
  );
}

/** Everything under the page title. Meant to sit in a `Stack` with `gap="md"`. */
export function SimpleGuideBody() {
  const siteUrl = window.location.origin;
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: gettingStartedUrl } = useDocsUrl("data-apps/getting-started");

  return (
    <>
      <Image
        src={EXAMPLE_IMAGE_URL}
        alt="An example data app: a sales overview of a storefront"
        w="100%"
        h="auto"
        bdrs="sm"
      />
      <Paragraph>
        Data apps are highly customizable interactive dashboards that your AI
        coding agent builds using your data in Metabase. Here&apos;s how to make
        one.
      </Paragraph>

      <Heading>Set up your tools</Heading>

      <Subheading>1. Install the Metabase CLI and log in</Subheading>
      <Snippet
        code={`npm install -g @metabase/cli\nmb auth login --url ${siteUrl}`}
      />

      <Subheading>2. Add the skill to your agent</Subheading>
      <Snippet code="npx skills add metabase/agent-skills --skill metabase-cli -a claude-code" />

      <Subheading>3. Publish the tables your app needs</Subheading>
      <Paragraph>
        An app can only read the tables and metrics in your{" "}
        <Link className={CS.link} to={Urls.dataStudioLibrary()}>
          semantic layer
        </Link>
        .
      </Paragraph>

      <Subheading>4. Connect a Git repository</Subheading>
      <Paragraph>
        Metabase gets your app from a repository. Connect one in{" "}
        <Link className={CS.link} to="/admin/settings/remote-sync">
          Remote sync settings
        </Link>
        , then clone it:
      </Paragraph>
      <Snippet
        code={"git clone https://github.com/your-org/your-repo\ncd your-repo"}
      />

      <Heading>Build the app</Heading>

      <Subheading>5. Ask your agent</Subheading>
      <Paragraph>
        Start your agent in the clone, and describe the app:
      </Paragraph>
      <Snippet code="Create a Metabase data app that shows our orders by month, and a table of the latest orders." />
      <Paragraph>
        The agent starts a preview on your computer. Ask for changes until the
        app looks right.
      </Paragraph>

      <Subheading>6. Ship it</Subheading>
      <Snippet code="Ship the app to my Metabase." />
      <Paragraph>
        Then open the app at <Code>{`${siteUrl}/apps/<slug>`}</Code>.
      </Paragraph>

      <Heading>Share the app</Heading>

      <Subheading>7. Add groups</Subheading>
      <Paragraph>
        Only admins can open the app until you add groups on its{" "}
        <strong>Permissions</strong> tab in{" "}
        <Link className={CS.link} to={Urls.dataStudioDataApps()}>
          Data apps
        </Link>
        .
      </Paragraph>

      <Heading>Stuck?</Heading>
      <Paragraph>
        Take a look at{" "}
        <ExternalLink href={gettingStartedUrl}>
          Getting started with data apps
        </ExternalLink>
        .
      </Paragraph>
    </>
  );
}
