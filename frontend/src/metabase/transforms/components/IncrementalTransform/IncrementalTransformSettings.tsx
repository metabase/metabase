import { useFormikContext } from "formik";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { FormSelect } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { TitleSection } from "metabase/transforms/components/TitleSection";
import {
  SOURCE_STRATEGY_OPTIONS,
  TARGET_STRATEGY_OPTIONS,
} from "metabase/transforms/constants";
import { getLibQuery, isMbqlQuery } from "metabase/transforms/utils";
import {
  Anchor,
  Box,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";

import {
  MBQLKeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "./KeysetColumnSelect";
import { NativeQueryColumnSelect } from "./NativeQueryColumnSelect";
import type { IncrementalSettingsFormValues } from "./form";

type IncrementalTransformSettingsProps = {
  source: TransformSource;
  incremental: boolean;
  onIncrementalChange: (value: boolean) => void;
  variant?: "embedded" | "standalone";
  readOnly?: boolean;
};

export const IncrementalTransformSettings = ({
  source,
  incremental,
  onIncrementalChange,
  variant = "embedded",
  readOnly,
}: IncrementalTransformSettingsProps) => {
  const metadata = useSelector(getMetadata);
  const libQuery = getLibQuery(source, metadata);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  // Check if this is a Python transform with exactly one source table
  // Incremental transforms are only supported for single-table Python transforms
  const isPythonTransform = source.type === "python";
  const isMultiTablePythonTransform =
    isPythonTransform && Object.keys(source["source-tables"]).length > 1;

  const transformType = match({
    isMbqlQuery: isMbqlQuery(source, metadata),
    isPythonTransform,
  })
    .with({ isMbqlQuery: true }, () => "query" as const)
    .with({ isPythonTransform: true }, () => "python" as const)
    .otherwise(() => "native" as const);
  const { url: incrementalTransformsDocsUrl, showMetabaseLinks } = useDocsUrl(
    isPythonTransform
      ? "data-studio/transforms/python-transforms#incremental-python-transforms"
      : "data-studio/transforms/query-transforms#incremental-query-transforms",
  );

  const renderIncrementalSwitch = () => {
    const switchContent = (
      <Switch
        disabled={
          readOnly || isMultiTablePythonTransform || isRemoteSyncReadOnly
        }
        checked={incremental}
        size="sm"
        label={
          isMultiTablePythonTransform
            ? t`Incremental transforms are only supported for single data source transforms.`
            : t`Only process new and changed data`
        }
        wrapperProps={{
          "data-testid": "incremental-switch",
        }}
        onChange={(e) => onIncrementalChange(e.target.checked)}
      />
    );

    if (isRemoteSyncReadOnly) {
      return (
        <Tooltip
          label={t`You can't edit this setting since Remote Sync is currently in read-only mode.`}
          withArrow={false}
        >
          <span>{switchContent}</span>
        </Tooltip>
      );
    }

    return switchContent;
  };

  const label = t`Incremental transformation`;
  const renderDescription = () => {
    const description = t`If you don’t need to reprocess all the data, incremental transforms can be faster. To use this, your transform definition should have a stable schema. `;
    return (
      <>
        {description}
        {showMetabaseLinks && (
          <Anchor
            href={incrementalTransformsDocsUrl}
            target="_blank"
            td="underline"
            c="inherit"
            size="sm"
          >{t`Learn more.`}</Anchor>
        )}{" "}
      </>
    );
  };
  if (variant === "standalone") {
    return (
      <TitleSection label={label} description={renderDescription()}>
        <Group p="lg">{renderIncrementalSwitch()}</Group>
        {incremental && (
          <>
            <Divider />
            <Group p="lg">
              <SourceStrategyFields
                source={source}
                query={libQuery}
                type={transformType}
                readOnly={readOnly}
              />
            </Group>
            <TargetStrategyFields variant={variant} />
          </>
        )}
      </TitleSection>
    );
  }

  return (
    <Stack gap="lg">
      <Box>
        <Text fw="bold">{label}</Text>
        <Text size="sm" lh="1rem" mb="sm">
          {renderDescription()}
        </Text>
        {renderIncrementalSwitch()}
      </Box>
      {incremental && (
        <>
          <SourceStrategyFields
            source={source}
            query={libQuery}
            type={transformType}
          />
          <TargetStrategyFields variant={variant} />
        </>
      )}
    </Stack>
  );
};

function TargetStrategyFields({
  variant,
}: {
  variant: "embedded" | "standalone";
}) {
  const content = TARGET_STRATEGY_OPTIONS.length > 1 && (
    <Stack>
      <FormSelect
        name="targetStrategy"
        label={t`Target Strategy`}
        description={t`How to update the target table`}
        data={TARGET_STRATEGY_OPTIONS}
      />
      {/* Append strategy has no additional fields */}
      {/* Future strategies like "merge" could add fields here */}
    </Stack>
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    content && (
      <>
        <Divider />
        <Group p="lg">{content}</Group>
      </>
    )
  );
}

type SourceStrategyFieldsProps = {
  source: TransformSource;
  query: Lib.Query | null;
  type: "query" | "native" | "python";
  readOnly?: boolean;
};

function SourceStrategyFields({
  source,
  query,
  type,
  readOnly,
}: SourceStrategyFieldsProps) {
  const { values } = useFormikContext<IncrementalSettingsFormValues>();
  return (
    <>
      {SOURCE_STRATEGY_OPTIONS.length > 1 && (
        <FormSelect
          name="sourceStrategy"
          label={t`Source Strategy`}
          description={t`How to track which rows to process`}
          data={SOURCE_STRATEGY_OPTIONS}
          disabled={readOnly}
        />
      )}
      {values.sourceStrategy === "checkpoint" && (
        <>
          {type === "query" && query && (
            <MBQLKeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ lh: "1rem" }}
              query={query}
              source={source}
              disabled={readOnly}
            />
          )}
          {type === "native" && query && (
            <NativeQueryColumnSelect
              name="checkpointFilter"
              label={t`Column to check for new values`}
              placeholder={t`Pick a column`}
              description={t`Pick the column that we should scan to determine which records are new or changed`}
              descriptionProps={{ lh: "1rem" }}
              query={query}
              disabled={readOnly}
            />
          )}
          {type === "python" && "source-tables" in source && (
            <PythonKeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ lh: "1rem" }}
              sourceTables={source["source-tables"]}
              disabled={readOnly}
            />
          )}
        </>
      )}
    </>
  );
}
