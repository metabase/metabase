import { useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { FormSelect, FormSwitch } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Alert, Stack } from "metabase/ui";
import { useLazyCheckQueryComplexityQuery } from "metabase-enterprise/api";
import {
  KeysetColumnSelect,
  PythonKeysetColumnSelect,
} from "metabase-enterprise/transforms/components/IncrementalTransform/KeysetColumnSelect";
import { NativeQueryColumnSelect } from "metabase-enterprise/transforms/components/IncrementalTransform/NativeQueryColumnSelect";
import {
  SOURCE_STRATEGY_OPTIONS,
  TARGET_STRATEGY_OPTIONS,
} from "metabase-enterprise/transforms/constants";
import type { NewTransformValues } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery, TransformSource } from "metabase-types/api";

export const IncrementalTransformSettings = ({
  source,
  checkOnMount,
}: {
  source: TransformSource;
  checkOnMount?: boolean;
}) => {
  const metadata = useSelector(getMetadata);
  const { values } = useFormikContext<NewTransformValues>();
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
    isPythonTransform &&
    "source-tables" in source &&
    Object.keys(source["source-tables"]).length > 1;

  const [checkQueryComplexity, { data: complexity }] =
    useLazyCheckQueryComplexityQuery();
  const [showComplexityWarning, setShowComplexityWarning] = useState(false);
  useEffect(() => {
    return () => {
      setShowComplexityWarning(false);
    };
  }, [checkOnMount, checkQueryComplexity]);

  const { transformType, query } = useMemo(() => {
    if (isMbqlQuery) {
      return { transformType: "query" as const, query: libQuery };
    }
    if (isPythonTransform) {
      return { transformType: "python" as const, query: null };
    }
    return { transformType: "native" as const, query: source.query };
  }, [isMbqlQuery, isPythonTransform, libQuery, source]);

  useEffect(() => {
    async function checkExistingQueryComplexity() {
      if (
        checkOnMount &&
        transformType === "native" &&
        libQuery &&
        values.incremental
      ) {
        const { is_simple } = await checkQueryComplexity(
          Lib.rawNativeQuery(libQuery),
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
    values?.incremental,
  ]);

  return (
    <>
      <FormSwitch
        disabled={isMultiTablePythonTransform}
        name="incremental"
        label={
          isMultiTablePythonTransform
            ? t`Incremental transforms are only supported for single data source transforms.`
            : t`Incremental?`
        }
        onChange={async (e) => {
          if (transformType === "native" && libQuery && e.target.checked) {
            const complexity = await checkQueryComplexity(
              Lib.rawNativeQuery(libQuery),
            ).unwrap();
            setShowComplexityWarning(complexity?.is_simple === false);
          }
        }}
      />
      {values?.incremental && (
        <>
          {showComplexityWarning && (
            <Alert variant="info" icon="info">
              <Stack gap="xs">
                <span>{t`This query is too complex to allow automatic checkpoint column selection.`}</span>
                <span>
                  {t`Reason: `}
                  <strong>{complexity?.reason}</strong>
                </span>
              </Stack>
            </Alert>
          )}
          <SourceStrategyFields
            source={source}
            query={query}
            type={transformType}
          />
          <TargetStrategyFields />
        </>
      )}
    </>
  );
};

function TargetStrategyFields() {
  const { values } = useFormikContext<NewTransformValues>();

  if (!values.incremental) {
    return null;
  }

  return (
    <>
      {TARGET_STRATEGY_OPTIONS.length > 1 && (
        <FormSelect
          name="targetStrategy"
          label={t`Target Strategy`}
          description={t`How to update the target table`}
          data={TARGET_STRATEGY_OPTIONS}
        />
      )}
      {/* Append strategy has no additional fields */}
      {/* Future strategies like "merge" could add fields here */}
    </>
  );
}

type SourceStrategyFieldsProps = {
  source: TransformSource;
  query: Lib.Query | DatasetQuery | null;
  type: "query" | "native" | "python";
};

function SourceStrategyFields({
  source,
  query,
  type,
}: SourceStrategyFieldsProps) {
  const { values } = useFormikContext<NewTransformValues>();
  if (!values.incremental) {
    return null;
  }

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
              label={t`Source Filter Field`}
              placeholder={t`Select a field to filter on`}
              description={t`Which field from the source to use in the incremental filter`}
              query={query as Lib.Query}
            />
          )}
          {type === "native" && query && (
            <NativeQueryColumnSelect
              name="checkpointFilter"
              label={t`Source Filter Field`}
              placeholder={t`e.g. id`}
              description={t`Numeric column to use in the incremental filter`}
              query={query as DatasetQuery}
            />
          )}
          {type === "python" && "source-tables" in source && (
            <PythonKeysetColumnSelect
              name="checkpointFilterUniqueKey"
              label={t`Source Filter Field`}
              placeholder={t`Select a field to filter on`}
              description={t`Which field from the source to use in the incremental filter`}
              sourceTables={source["source-tables"]}
            />
          )}
        </>
      )}
    </>
  );
}
