import { useSetting } from "frontend/src/metabase/common/hooks";
import {
  ActionIcon,
  Box,
  CopyButton,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "frontend/src/metabase/ui";
import {
  isLocalOrSnapshotVersion,
  versionToNumericComponents,
} from "frontend/src/metabase/utils/version";
import { t } from "ttag";

import S from "./DataAppSkillsSection.module.css";

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
  // One line to copy (a runnable command); shown wrapped across lines for
  // readability.
  const installSkillCommand = [skillCommandBase, ...skillSelectors].join(" ");
  const installSkillCommandDisplay = [skillCommandBase, ...skillSelectors].join(
    "\n",
  );

  return (
    <Stack gap="sm">
      <Title order={3}>{t`AI skills`}</Title>

      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
      <Text>{t`Install Metabase Data App skills in your project, then ask your AI agent to create a data app.`}</Text>

      <Box className={S.command} pos="relative">
        <CopyButton value={installSkillCommand} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t`Copied!` : t`Copy`}>
              <ActionIcon
                className={S.copyButton}
                variant="subtle"
                c="text-secondary"
                aria-label={t`Copy`}
                data-testid="copy-button"
                onClick={copy}
              >
                <Icon name="copy" />
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>

        <Text component="pre" className={S.commandText}>
          {installSkillCommandDisplay}
        </Text>
      </Box>
    </Stack>
  );
};
