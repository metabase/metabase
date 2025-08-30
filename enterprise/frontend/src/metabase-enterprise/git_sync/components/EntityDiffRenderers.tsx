import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Center, Code, Loader, Text } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import { GitDiffVisualization } from "./GitDiffVisualization";

export const CardRenderer = ({ entity }: { entity: any }) => (
  <Box
    bg="var(--mb-color-bg-white)"
    bd="1px solid var(--mb-color-border)"
    bdrs="8px"
    p="16px"
    h="400px"
    style={{ overflow: "auto" }}
  >
    <GitDiffVisualization card={entity} />
  </Box>
);

export const TransformRenderer = ({ entity }: { entity: any }) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const transformCard = useMemo(() => {
    if (!entity?.source?.query) {
      return null;
    }
    return {
      name: entity.name || "Transform",
      dataset_query: entity.source.query,
      display: "table" as const,
      visualization_settings: {},
    };
  }, [entity]);

  useEffect(() => {
    if (!transformCard) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const cardForMetadata = _.omit(transformCard, "id");
    dispatch(loadMetadataForCard(cardForMetadata)).then(() => {
      setIsLoading(false);
    });
  }, [transformCard, dispatch]);

  // Create question after metadata is loaded
  useEffect(() => {
    if (!isLoading && transformCard && metadata) {
      try {
        const baseQuestion = new Question(transformCard, metadata);
        setModifiedQuestion(baseQuestion);
      } catch (error) {
        console.warn("Failed to create transform question:", error);
      }
    }
  }, [isLoading, transformCard, metadata]);

  // No-op function for read-only display
  const handleUpdateQuestion = async (newQuestion: Question) => {
    setModifiedQuestion(newQuestion);
  };

  const isNativeQuery = entity?.source?.query?.type === "native";

  if (isNativeQuery) {
    const sql = entity?.source?.query?.native?.query;
    if (!sql) {
      return null;
    }

    return (
      <Code
        block
        bg="var(--mb-color-bg-white)"
        bd="1px solid var(--mb-color-border)"
        bdrs="8px"
        p="16px"
        h="100%"
        style={{
          overflow: "auto",
          fontSize: "12px",
          lineHeight: "1.5",
        }}
      >
        {sql}
      </Code>
    );
  }

  if (isLoading) {
    return (
      <Center
        bg="var(--mb-color-bg-white)"
        bd="1px solid var(--mb-color-border)"
        bdrs="8px"
        p="16px"
        h="100%"
        style={{ overflow: "auto" }}
      >
        <Loader size="sm" />
      </Center>
    );
  }

  if (!modifiedQuestion) {
    return (
      <Center
        bg="var(--mb-color-bg-white)"
        bd="1px solid var(--mb-color-border)"
        bdrs="8px"
        p="16px"
        h="100%"
        style={{ overflow: "auto" }}
      >
        <Text c="text-medium" size="sm">
          {t`Unable to load transform query`}
        </Text>
      </Center>
    );
  }

  return (
    <Box
      bg="var(--mb-color-bg-white)"
      bd="1px solid var(--mb-color-border)"
      bdrs="8px"
      p="16px"
      h="100%"
      style={{ overflow: "auto" }}
    >
      <Notebook
        question={modifiedQuestion}
        isDirty={false}
        isRunnable={false}
        isResultDirty={false}
        reportTimezone={reportTimezone}
        hasVisualizeButton={false}
        updateQuestion={handleUpdateQuestion}
        readOnly={true}
      />
    </Box>
  );
};

export const DefaultRenderer = ({ entity }: { entity: any }) => (
  <Box
    bg="var(--mb-color-bg-white)"
    bd="1px solid var(--mb-color-border)"
    bdrs="8px"
    p="16px"
    h="100%"
    style={{ overflow: "auto" }}
  >
    <Text size="sm" c="text-medium">
      {JSON.stringify(entity, null, 2)}
    </Text>
  </Box>
);
