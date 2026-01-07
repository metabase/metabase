import { useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { FormSelect, FormSwitch } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Alert, Box, Divider, Group, Stack, Text } from "metabase/ui";
import { useLazyCheckQueryComplexityQuery } from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/transforms/components/TitleSection";
import {
  CHECKPOINT_TEMPLATE_TAG,
  SOURCE_STRATEGY_OPTIONS,
  TARGET_STRATEGY_OPTIONS,
} from "metabase-enterprise/transforms/constants";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { TransformSource } from "metabase-types/api";

import {
  KeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "./KeysetColumnSelect";
import { NativeQueryColumnSelect } from "./NativeQueryColumnSelect";
import type { IncrementalSettingsFormValues } from "./form";

type IncrementalTransformSettingsProps = {
  source: TransformSource;
  checkOnMount?: boolean;
  variant?: "embedded" | "standalone";
  readOnly?: boolean;
};

export const IncrementalTransformSettings = ({
  source,
  checkOnMount,
  variant = "embedded",
  readOnly,
}: IncrementalTransformSettingsProps) => {
  const metadata = useSelector(getMetadata);
  const { values } = useFormikContext<IncrementalSettingsFormValues>();
  // Convert DatasetQuery to Lib.Query via Question
  const libQuery = useMemo(() => {
    if (source.type !== "query") {
      return null;
    }

    try {
      const question = Question.create({
        dataset_query: source.query,
        metadata,
      });
      return question.query();
    } catch (error) {
      console.error("SourceStrategyFields: Error creating question", error);
      return null;
    }
  }, [source, metadata]);

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

  const [checkQueryComplexity, { data: complexity }] =
    useLazyCheckQueryComplexityQuery();
  const [showComplexityWarning, setShowComplexityWarning] = useState(false);

  const { transformType, query } = useMemo(() => {
    if (isMbqlQuery) {
      return { transformType: "query" as const, query: libQuery };
    }
    if (isPythonTransform) {
      return { transformType: "python" as const, query: null };
    }
    return { transformType: "native" as const, query: libQuery };
  }, [isMbqlQuery, isPythonTransform, libQuery]);

  const hasCheckpointTag = useMemo(() => {
    if (!libQuery || transformType !== "native") {
      return false;
    }
    const tags = Lib.templateTags(libQuery);
    return CHECKPOINT_TEMPLATE_TAG in tags;
  }, [libQuery, transformType]);

  useEffect(() => {
    async function checkExistingQueryComplexity() {
      if (
        checkOnMount &&
        transformType === "native" &&
        libQuery &&
        !hasCheckpointTag &&
        "source-incremental-strategy" in source
      ) {
        const { is_simple } = await checkQueryComplexity(
          Lib.rawNativeQuery(libQuery),
          true,
        ).unwrap();
        setShowComplexityWarning(!is_simple);
      }
    }
    checkExistingQueryComplexity();
  }, [
    checkOnMount,
    checkQueryComplexity,
    libQuery,
    transformType,
    source,
    hasCheckpointTag,
  ]);

  const renderIncrementalSwitch = () => (
    <FormSwitch
      disabled={readOnly || isMultiTablePythonTransform}
      name="incremental"
      size="sm"
      label={
        isMultiTablePythonTransform
          ? t`Incremental transforms are only supported for single data source transforms.`
          : t`Only process new and changed data`
      }
      onChange={async (e) => {
        if (
          e.target.checked &&
          transformType === "native" &&
          !hasCheckpointTag &&
          query
        ) {
          const complexity = await checkQueryComplexity(
            Lib.rawNativeQuery(query),
            true,
          ).unwrap();
          setShowComplexityWarning(complexity?.is_simple === false);
        }
      }}
      wrapperProps={{
        "data-testid": "incremental-switch",
      }}
    />
  );

  const complexityWarningAlert = showComplexityWarning && (
    <Alert variant="info" icon="info">
      <Stack gap="xs">
        <span>
          {t`This query is too complex to allow automatic checkpoint column selection. You may need to explicitely add a conditional filter in your query, for example:`}
        </span>
        <code>{`[[ WHERE id > {{${CHECKPOINT_TEMPLATE_TAG}}} ]]`}</code>
        <span>
          {t`Reason: `}
          <strong>{complexity?.reason}</strong>
        </span>
      </Stack>
    </Alert>
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
                query={query}
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
            query={query}
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
            <KeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Field to check for new values`}
              placeholder={t`Pick a field`}
              description={t`Pick the field that we should scan to determine which records are new or changed`}
              descriptionProps={{ c: "text-secondary", mb: "xs" }}
              query={query}
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
            />
          )}
        </>
      )}
    </>
  );
}
