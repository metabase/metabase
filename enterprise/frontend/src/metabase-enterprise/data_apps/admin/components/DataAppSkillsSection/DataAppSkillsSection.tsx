import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { useSetting } from "metabase/common/hooks";
import { Stack, Text, Title } from "metabase/ui";
import {
  isLocalOrSnapshotVersion,
  versionToNumericComponents,
} from "metabase/utils/version";

const REPOSITORY_NAME = "metabase/metabase";
const MAIN_BRANCH_NAME = "master";
const RELEASE_BRANCH_PREFIX = "release";
const PUBLIC_SKILLS_PATH = "/skills";

// The data-app skills to install. `skills add metabase/metabase` alone would
// discover *every* skill in the repo, so each is selected explicitly.
const DATA_APP_SKILLS = [
  "metabase-data-app-setup",
  "metabase-data-app-routing",
  "metabase-data-app-actions",
  "metabase-data-app-semantic-layer",
];

export const DataAppSkillsSection = () => {
  // Pin the data-app skills (and the template bundled inside `metabase-data-app-setup`)
  // to the branch matching this instance: `release-x.<major>.x`, or `master` for
  // local/dev builds that have no release branch.
  const { tag } = useSetting("version");
  const majorVersion = tag ? versionToNumericComponents(tag)?.[1] : undefined;
  const skillBranch =
    tag && !isLocalOrSnapshotVersion(tag) && majorVersion != null
      ? `${RELEASE_BRANCH_PREFIX}-x.${majorVersion}.x`
      : MAIN_BRANCH_NAME;

  const skillCommandBase = `npx skills add ${REPOSITORY_NAME}${PUBLIC_SKILLS_PATH}#${skillBranch}`;
  const skillSelectors = DATA_APP_SKILLS.map((skill) => `--skill ${skill}`);
  // Joined with shell line-continuations (` \` + newline) so each `--skill` is on
  // its own line for readability, while the copied text is still one runnable
  // command when pasted.
  const installSkillCommand = [skillCommandBase, ...skillSelectors].join(
    " \\\n",
  );

  return (
    <Stack gap="sm">
      <Title order={3}>{t`AI skills`}</Title>

      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
      <Text>{t`Install Metabase Data App skills in your project, then ask your AI agent to create a data app.`}</Text>

      <CopyTextArea
        value={installSkillCommand}
        aria-label={t`Install command`}
        autosize
        ff="monospace"
      />
    </Stack>
  );
};
