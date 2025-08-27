import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Center, Code, Text } from "metabase/ui";
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

  const transformCard = useMemo(() => {
    if (!entity?.source?.query) {
      return null;
    }
    return {
      id: null,
      name: "Transform",
      dataset_query: entity.source.query,
      display: "table" as const,
      visualization_settings: {},
    };
  }, [entity]);

  useEffect(() => {
    if (transformCard) {
      dispatch(loadMetadataForCard(transformCard));
    }
  }, [transformCard, dispatch]);

  const question = useMemo(() => {
    if (!transformCard || !metadata) {
      return null;
    }
    try {
      return new Question(transformCard, metadata);
    } catch (error) {
      console.warn("Failed to create transform question:", error);
      return null;
    }
  }, [transformCard, metadata]);

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

  if (!question) {
    return (
      <Center
        bg="var(--mb-color-bg-white)"
        bd="1px solid var(--mb-color-border)"
        bdrs="8px"
        p="16px"
        h="100%"
        style={{ overflow: "auto" }}
      >
        <Text
          c="text-medium"
          size="sm"
        >{t`Unable to load transform query`}</Text>
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
        question={question}
        isEditable={false}
        isDirty={false}
        hasVisualizeButton={false}
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
