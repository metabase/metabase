import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useGetCardQuery, useListRevisionsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Alert,
  Badge,
  Group,
  Icon,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type Question from "metabase-lib/v1/Question";
import type { RevisionId } from "metabase-types/api";

import { type SqlDiffViewMode, SqlDiffViewer } from "./SqlDiffViewer";
import { normalizeSqlFormatting } from "./utils/normalize-sql";
import {
  type QuestionVersion,
  getDefaultComparison,
  getQuestionVersions,
  getVersionSql,
} from "./utils/revision-sql";
import { computeLineDiff, getDiffStats } from "./utils/sql-diff";

interface QuestionVersionDiffModalProps {
  question: Question;
  opened: boolean;
  onClose: () => void;
}

export function QuestionVersionDiffModal({
  question,
  opened,
  onClose,
}: QuestionVersionDiffModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Compare versions`}
      size="min(80rem, 95vw)"
      data-testid="question-version-diff-modal"
    >
      {opened && <QuestionVersionDiffContent question={question} />}
    </Modal>
  );
}

function QuestionVersionDiffContent({ question }: { question: Question }) {
  const cardId = question.id();
  const {
    data: revisions,
    isLoading: isLoadingRevisions,
    error: revisionsError,
  } = useListRevisionsQuery({ id: cardId, entity: "card" });
  // The saved card, not the question in the editor, which may have unsaved changes
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({ id: cardId });

  const versions = useMemo(
    () =>
      revisions ? getQuestionVersions(revisions, card?.dataset_query) : [],
    [revisions, card],
  );

  const isLoading = isLoadingRevisions || isLoadingCard;
  const error = revisionsError ?? cardError;
  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const defaultComparison = getDefaultComparison(versions);
  if (!defaultComparison) {
    return (
      <Text>{t`This question needs at least two versions to compare.`}</Text>
    );
  }

  return (
    <VersionComparison
      versions={versions}
      defaultOldVersion={defaultComparison.oldVersion}
      defaultNewVersion={defaultComparison.newVersion}
      engine={question.database()?.engine}
    />
  );
}

const getVersionLabel = ({ versionNumber, revision }: QuestionVersion) => {
  const author = revision.user.common_name;
  const time = getRelativeTime(revision.timestamp);
  return t`Version ${versionNumber} · ${author} · ${time}`;
};

interface VersionComparisonProps {
  versions: QuestionVersion[];
  defaultOldVersion: QuestionVersion;
  defaultNewVersion: QuestionVersion;
  engine: string | undefined;
}

function VersionComparison({
  versions,
  defaultOldVersion,
  defaultNewVersion,
  engine,
}: VersionComparisonProps) {
  const [oldId, setOldId] = useState<RevisionId>(defaultOldVersion.revision.id);
  const [newId, setNewId] = useState<RevisionId>(defaultNewVersion.revision.id);
  const [mode, setMode] = useState<SqlDiffViewMode>("unified");
  const [ignoreFormatting, setIgnoreFormatting] = useState(false);

  const options = versions.map((version) => ({
    value: String(version.revision.id),
    label: getVersionLabel(version),
  }));
  const findVersion = (id: RevisionId) =>
    versions.find((version) => version.revision.id === id);
  const oldVersion = findVersion(oldId) ?? defaultOldVersion;
  const newVersion = findVersion(newId) ?? defaultNewVersion;

  return (
    <Stack gap="md">
      <Group align="end" gap="md">
        <Select
          label={t`Old version`}
          data={options}
          value={String(oldVersion.revision.id)}
          onChange={(value) => value && setOldId(Number(value))}
          allowDeselect={false}
          miw="22rem"
          data-testid="question-version-diff-old-select"
        />
        <Icon name="arrow_right" mb="sm" c="text-secondary" />
        <Select
          label={t`New version`}
          data={options}
          value={String(newVersion.revision.id)}
          onChange={(value) => value && setNewId(Number(value))}
          allowDeselect={false}
          miw="22rem"
          data-testid="question-version-diff-new-select"
        />
        <SegmentedControl
          value={mode}
          onChange={(value) =>
            // SegmentedControl types its value as `string`, but it can only
            // emit the `value` of one of the options below
            setMode(value as SqlDiffViewMode)
          }
          data={[
            { value: "unified", label: t`Unified` },
            { value: "split", label: t`Side by side` },
          ]}
        />
        <Switch
          label={t`Ignore formatting`}
          checked={ignoreFormatting}
          onChange={(event) => setIgnoreFormatting(event.currentTarget.checked)}
          mb="sm"
        />
      </Group>

      <VersionSqlDiff
        key={`${oldVersion.revision.id}-${newVersion.revision.id}-${mode}-${ignoreFormatting}`}
        oldVersion={oldVersion}
        newVersion={newVersion}
        mode={mode}
        ignoreFormatting={ignoreFormatting}
        engine={engine}
      />
    </Stack>
  );
}

interface VersionSqlDiffProps {
  oldVersion: QuestionVersion;
  newVersion: QuestionVersion;
  mode: SqlDiffViewMode;
  ignoreFormatting: boolean;
  engine: string | undefined;
}

function VersionSqlDiff({
  oldVersion,
  newVersion,
  mode,
  ignoreFormatting,
  engine,
}: VersionSqlDiffProps) {
  const oldSql = getVersionSql(oldVersion);
  const newSql = getVersionSql(newVersion);

  const normalized = useAsync(async () => {
    if (oldSql == null || newSql == null) {
      return null;
    }
    const [oldNormalized, newNormalized] = await Promise.all([
      normalizeSqlFormatting(oldSql, engine),
      normalizeSqlFormatting(newSql, engine),
    ]);
    return { oldSql: oldNormalized, newSql: newNormalized };
  }, [oldSql, newSql, engine]);

  if (oldSql == null || newSql == null) {
    const version = oldSql == null ? oldVersion : newVersion;
    return (
      <Alert color="warning" icon={<Icon name="warning" />}>
        {version.query.type === "not-native"
          ? t`Version ${version.versionNumber} is not a native SQL query, so it can't be compared.`
          : t`The SQL of version ${version.versionNumber} isn't available in its revision history.`}
      </Alert>
    );
  }

  if (ignoreFormatting && normalized.loading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const isFormattingOnly =
    oldSql !== newSql &&
    normalized.value != null &&
    normalized.value.oldSql === normalized.value.newSql;
  const [shownOldSql, shownNewSql] =
    ignoreFormatting && normalized.value
      ? [normalized.value.oldSql, normalized.value.newSql]
      : [oldSql, newSql];
  const stats = getDiffStats(computeLineDiff(shownOldSql, shownNewSql));
  const hasChanges = stats.added > 0 || stats.removed > 0;

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Text c="feedback-positive" fw="bold">{`+${stats.added}`}</Text>
        <Text c="feedback-negative" fw="bold">{`−${stats.removed}`}</Text>
        {isFormattingOnly && (
          <Badge
            variant="light"
            data-testid="question-version-diff-formatting-only"
          >
            {t`Formatting-only change`}
          </Badge>
        )}
        {ignoreFormatting && (
          <Text c="text-secondary" size="sm">
            {t`Both versions are shown reformatted.`}
          </Text>
        )}
      </Group>
      {hasChanges ? (
        <SqlDiffViewer oldSql={shownOldSql} newSql={shownNewSql} mode={mode} />
      ) : (
        <Text c="text-secondary" data-testid="question-version-diff-no-changes">
          {oldSql === newSql
            ? t`These versions have identical SQL.`
            : t`These versions only differ in formatting.`}
        </Text>
      )}
    </Stack>
  );
}
