import { useFormikContext } from "formik";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { FormSelect } from "metabase/forms";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { TitleSection } from "metabase/transforms/components/TitleSection";
import {
  SOURCE_STRATEGY_OPTIONS,
  TARGET_STRATEGY_OPTIONS,
} from "metabase/transforms/constants";
import { getLibQuery } from "metabase/transforms/utils";
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
import { useSelector } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";
import type { TransformType } from "metabase-types/api/transform";

import {
  MBQLKeysetColumnSelect,
  NativeQueryTableTagFieldSelect,
  PythonKeysetColumnSelect,
} from "./KeysetColumnSelect";
import type { IncrementalSettingsFormValues } from "./form";
import { useHasCheckpointOptions } from "./useHasCheckpointOptions";

type IncrementalTransformSettingsProps = {
  source: TransformSource;
  incremental: boolean;
  onIncrementalChange: (value: boolean) => void;
  variant?: "embedded" | "standalone";
  readOnly?: boolean;
  extraActions?: React.ReactNode;
};

export const IncrementalTransformSettings = ({
  source,
  incremental,
  onIncrementalChange,
  variant = "embedded",
  readOnly,
  extraActions,
}: IncrementalTransformSettingsProps) => {
  const metadata = useSelector(getMetadata);
  const libQuery = getLibQuery(source, metadata);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const { hasCheckpointOptions, transformType } =
    useHasCheckpointOptions(source);

  const isMultiTablePythonTransform =
    getIsPythonTransformWithMultipleTables(source);
  const isNativeWithoutTableTags = getIsNativeWithoutTableVariables(
    libQuery,
    transformType,
  );

  const { url: incrementalTransformsDocsUrl, showMetabaseLinks } = useDocsUrl(
    transformType === "python"
      ? "data-studio/transforms/python-transforms#incremental-python-transforms"
      : "data-studio/transforms/query-transforms#incremental-query-transforms",
  );

  const renderIncrementalSwitch = () => {
    const getLabel = () => {
      if (isMultiTablePythonTransform) {
        return t`Incremental transforms are only supported for single data source transforms.`;
      }
      if (isNativeWithoutTableTags) {
        return t`Incremental transforms for native queries require a table variable.`;
      }
      if (!hasCheckpointOptions) {
        return t`Incremental transforms require at least one numeric or temporal source field.`;
      }
      return t`Only process new and changed data`;
    };

    const transformHasIssues =
      isNativeWithoutTableTags ||
      !hasCheckpointOptions ||
      isMultiTablePythonTransform;

    const switchContent = (
      <Switch
        disabled={
          readOnly ||
          isRemoteSyncReadOnly ||
          (!incremental && transformHasIssues)
        }
        checked={incremental}
        size="sm"
        label={getLabel()}
        wrapperProps={{
          "data-testid": "incremental-switch",
        }}
        onChange={(event) => onIncrementalChange(event.target.checked)}
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
    const description = t`If you don’t need to reprocess all the data, incremental transforms can be faster. To use this, your transform definition should have a stable schema.`;
    return (
      <>
        {description}
        {showMetabaseLinks && (
          <>
            {" "}
            <Anchor
              href={incrementalTransformsDocsUrl}
              target="_blank"
              td="underline"
              c="inherit"
              size="sm"
            >{t`Learn more.`}</Anchor>
          </>
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
                transformType={transformType}
                readOnly={readOnly}
              />
            </Group>
            {extraActions && (
              <>
                <Divider />
                <Group p="lg">{extraActions}</Group>
              </>
            )}
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
            transformType={transformType}
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
  transformType: TransformType;
  readOnly?: boolean;
};

function SourceStrategyFields({
  source,
  query,
  transformType,
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
          {transformType === "mbql" && query && (
            <MBQLKeysetColumnSelect
              name="checkpointFilterFieldId"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ lh: "1rem" }}
              query={query}
              source={source}
              disabled={readOnly}
            />
          )}
          {transformType === "native" && query && (
            <NativeQueryTableTagFieldSelect
              name="checkpointFilterFieldId"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ lh: "1rem" }}
              query={query}
              disabled={readOnly}
            />
          )}
          {transformType === "python" && "source-tables" in source && (
            <PythonKeysetColumnSelect
              name="checkpointFilterFieldId"
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

// Check if this is a Python transform with exactly one source table
// Incremental transforms are only supported for single-table Python transforms
function getIsPythonTransformWithMultipleTables(source: TransformSource) {
  const isPythonTransform = source.type === "python";
  const isMultiTablePythonTransform =
    isPythonTransform && source["source-tables"].length > 1;

  return isMultiTablePythonTransform;
}

function getIsNativeWithoutTableVariables(
  query: Lib.Query | null,
  transformType: TransformType,
) {
  return transformType === "native" && !queryHasTableVariables(query);
}

function queryHasTableVariables(query: Lib.Query | null) {
  const hasTableTemplateTags = query
    ? Object.values(Lib.templateTags(query)).some(
        (tag) => tag.type === "table" && tag["table-id"] != null,
      )
    : false;

  return hasTableTemplateTags;
}
