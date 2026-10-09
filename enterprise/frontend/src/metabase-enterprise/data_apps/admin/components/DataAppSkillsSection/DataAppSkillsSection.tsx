import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { useSetting } from "metabase/settings";
import { Stack, Text, Title } from "metabase/ui";
import {
  isLocalOrSnapshotVersion,
  versionToNumericComponents,
} from "metabase/utils/version";

const SKILLS_PATH = "metabase/agent-skills/skills";
const DATA_APP_SKILLS_PATH = `${SKILLS_PATH}/data-apps`;
const MASTER_FOLDER_NAME = "master";

// The data-app skills to install. They're marked internal, so `skills add`
// installs them only when each is named.
const DATA_APP_SKILLS = [
  "metabase-data-app-setup",
  "metabase-data-app-routing",
  "metabase-data-app-actions",
  "metabase-data-app-semantic-layer",
  "metabase-data-app-migrate",
];

// Writes the YAML an app's resources are committed as. It isn't kept per
// Metabase version, so it's installed from outside the data-app folders.
const REPRESENTATION_SKILL_COMMAND = `npx skills add ${SKILLS_PATH} --skill metabase-representation-format`;

export const DataAppSkillsSection = () => {
  // Install the data-app skills (and the template bundled inside `metabase-data-app-setup`)
  // from the folder matching this instance: `data-apps/<major>`, or `data-apps/master`
  // for local/dev builds that have no release.
  const { tag } = useSetting("version");
  const majorVersion = tag ? versionToNumericComponents(tag)?.[1] : undefined;
  const skillsFolder =
    tag && !isLocalOrSnapshotVersion(tag) && majorVersion != null
      ? String(majorVersion)
      : MASTER_FOLDER_NAME;

  const skillCommandBase = `npx skills add ${DATA_APP_SKILLS_PATH}/${skillsFolder}`;
  const skillSelectors = DATA_APP_SKILLS.map((skill) => `--skill ${skill}`);
  // Joined with shell line-continuations (` \` + newline) so each `--skill` is on
  // its own line for readability, while the copied text is still one runnable
  // command when pasted.
  const installSkillCommand = [
    [skillCommandBase, ...skillSelectors].join(" \\\n"),
    REPRESENTATION_SKILL_COMMAND,
  ].join(" && \\\n");

  return (
    <Stack gap="sm">
      <Title order={3}>{t`AI skills`}</Title>

      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
      <Text>{t`Install Metabase Data App skills in your project, then ask your AI agent to create a data app.`}</Text>

      <CopyTextArea
        value={installSkillCommand}
        aria-label={t`Install command`}
        autosize
        // The theme caps a textarea at 6 rows; fit the whole command instead.
        maxRows={installSkillCommand.split("\n").length}
        ff="monospace"
      />
    </Stack>
  );
};
