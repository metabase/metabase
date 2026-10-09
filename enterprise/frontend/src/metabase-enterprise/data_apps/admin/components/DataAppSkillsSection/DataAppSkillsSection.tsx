import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { Stack, Text, Title } from "metabase/ui";

const SKILLS_PATH = "metabase/agent-skills/skills";

// metabase/agent-skills keeps one folder per breaking version of each data-app
// skill, at `skills/<skill>/<version>`.
const DATA_APP_SKILLS_VERSION = "v1";

const DATA_APP_SKILLS = [
  "metabase-data-app-setup",
  "metabase-data-app-routing",
  "metabase-data-app-actions",
  "metabase-data-app-semantic-layer",
  "metabase-data-app-migrate",
];

// Writes the YAML an app's resources are committed as.
const REPRESENTATION_SKILL = "metabase-representation-format";

// The skills are marked internal, so each install also names its skill.
const getInstallCommand = (path: string, skill: string) =>
  `npx skills add ${path} \\\n  --skill ${skill}`;

// `skills add` takes one path, so each skill gets its own install. Joined with
// shell line-continuations (` \` + newline), the copied text is still one
// runnable command when pasted.
const INSTALL_SKILLS_COMMAND = [
  ...DATA_APP_SKILLS.map((skill) =>
    getInstallCommand(
      `${SKILLS_PATH}/${skill}/${DATA_APP_SKILLS_VERSION}`,
      skill,
    ),
  ),
  getInstallCommand(SKILLS_PATH, REPRESENTATION_SKILL),
].join(" && \\\n");

export const DataAppSkillsSection = () => (
  <Stack gap="sm">
    <Title order={3}>{t`AI skills`}</Title>

    {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
    <Text>{t`Install Metabase Data App skills in your project, then ask your AI agent to create a data app.`}</Text>

    <CopyTextArea
      value={INSTALL_SKILLS_COMMAND}
      aria-label={t`Install command`}
      autosize
      // The theme caps a textarea at 6 rows; show the whole command instead.
      maxRows={Infinity}
      // `ff` styles the field's wrapper, not the textarea that holds the text.
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
    />
  </Stack>
);
