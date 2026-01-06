import { useFormikContext } from "formik";
import { useCallback, useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { FormSelect, FormSwitch } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Divider, Group, Stack, Text } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/transforms/components/TitleSection";
import {
  CHECKPOINT_TEMPLATE_TAG,
  SOURCE_STRATEGY_OPTIONS,
  TARGET_STRATEGY_OPTIONS,
} from "metabase-enterprise/transforms/constants";
import * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";

import {
  QueryComplexityWarning,
  useQueryComplexityCheck,
} from "../QueryComplexityWarning";

import {
  KeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "./KeysetColumnSelect";
import { NativeQueryColumnSelect } from "./NativeQueryColumnSelect";
import type { IncrementalSettingsFormValues } from "./form";

type IncrementalTransformSettingsProps = {
  source: TransformSource;
  variant?: "embedded" | "standalone";
};

export const IncrementalTransformSettings = ({
  source,
  variant = "embedded",
}: IncrementalTransformSettingsProps) => {
  const metadata = useSelector(getMetadata);
  const { values } = useFormikContext<IncrementalSettingsFormValues>();

  const libQuery = (() => {
    if (source.type !== "query") {
      return null;
    }
    return Lib.fromJsQueryAndMetadata(metadata, source.query);
  })();

  // Check if this is an MBQL query (not native SQL or Python)
  const isMbqlQuery = useMemo(() => {
    if (!libQuery) {
      return false;
    }

    try {
      const queryDisplayInfo = Lib.queryDisplayInfo(libQuery);
      return !queryDisplayInfo.isNative;
    } catch (error) {
      console.error("Error checking query type", error);
      return false;
    }
  }, [libQuery]);

  // Check if this is a Python transform with exactly one source table
  // Incremental transforms are only supported for single-table Python transforms
  const isPythonTransform = source.type === "python";
  const isMultiTablePythonTransform =
    isPythonTransform && Object.keys(source["source-tables"]).length > 1;

  const transformType = match({ isMbqlQuery, isPythonTransform })
    .with({ isMbqlQuery: true }, () => "query" as const)
    .with({ isPythonTransform: true }, () => "python" as const)
    .otherwise(() => "native" as const);

  const hasCheckpointTag = useMemo(() => {
    if (!libQuery || transformType !== "native") {
      return false;
    }
    const tags = Lib.templateTags(libQuery);
    return CHECKPOINT_TEMPLATE_TAG in tags;
  }, [libQuery, transformType]);

  const { tryCheckQueryComplexity, shouldShowWarning } =
    useQueryComplexityCheck();

  const handleCheckQueryComplexity = useCallback(() => {
    if (transformType !== "native" || hasCheckpointTag || !libQuery) {
      return;
    }
    tryCheckQueryComplexity(Lib.rawNativeQuery(libQuery));
  }, [transformType, hasCheckpointTag, libQuery, tryCheckQueryComplexity]);

  useEffect(() => {
    if (values.incremental) {
      handleCheckQueryComplexity();
    }
  }, [values.incremental, handleCheckQueryComplexity]);

  const renderIncrementalSwitch = () => (
    <FormSwitch
      disabled={isMultiTablePythonTransform}
      name="incremental"
      size="sm"
      label={
        isMultiTablePythonTransform
          ? t`Incremental transforms are only supported for single data source transforms.`
          : t`Only process new and changed data`
      }
      wrapperProps={{
        "data-testid": "incremental-switch",
      }}
    />
  );

  const complexityWarningAlert = shouldShowWarning && (
    <QueryComplexityWarning />
  );

  const label = t`Incremental transformation`;
  const description = t`If you don't need to reprocess everything, incremental transforms can be faster.`;
  if (variant === "standalone") {
    return (
      <TitleSection label={label} description={description}>
        <Group p="lg">{renderIncrementalSwitch()}</Group>
        {values?.incremental && (
          <>
            {complexityWarningAlert && (
              <>
                <Divider />
                <Group p="lg">{complexityWarningAlert}</Group>
              </>
            )}
            <Divider />
            <Group p="lg">
              <SourceStrategyFields
                source={source}
                query={libQuery}
                type={transformType}
              />
            </Group>
            <TargetStrategyFields variant={variant} />
          </>
        )}
      </TitleSection>
    );
  }

  return (
    <Group gap="lg">
      <Box>
        <Text fw="bold">{label}</Text>
        <Text size="sm" c="text-secondary" mb="sm">
          {description}
        </Text>
        {renderIncrementalSwitch()}
      </Box>
      {values?.incremental && (
        <>
          {complexityWarningAlert}
          <SourceStrategyFields
            source={source}
            query={libQuery}
            type={transformType}
          />
          <TargetStrategyFields variant={variant} />
        </>
      )}
    </Group>
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
};

function SourceStrategyFields({
  source,
  query,
  type,
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
        />
      )}
      {values.sourceStrategy === "checkpoint" && (
        <>
          {type === "query" && query && (
            <KeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ c: "text-secondary", mb: "xs" }}
              query={query}
            />
          )}
          {type === "native" && query && (
            <NativeQueryColumnSelect
              name="checkpointFilter"
              label={t`Column to check for new values`}
              placeholder={t`Pick a column`}
              description={t`Pick the column that we should scan to determine which records are new or changed`}
              descriptionProps={{ c: "text-secondary", mb: "xs" }}
              query={query}
            />
          )}
          {type === "python" && "source-tables" in source && (
            <PythonKeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ c: "text-secondary", mb: "xs" }}
              sourceTables={source["source-tables"]}
            />
          )}
        </>
      )}
    </>
  );
}
