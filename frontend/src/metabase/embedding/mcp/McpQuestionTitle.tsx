import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";

export function McpQuestionTitle() {
  const { question } = useSdkQuestionContext();

  const title = useMemo(() => {
    if (!question) {
      return null;
    }

    const query = question.query();

    // TODO(EMB-1666): Show MCP Apps question title without time granularity instead
    return question.displayName() ?? Lib.suggestedName(query);
  }, [question]);

  if (!title) {
    return null;
  }

  return (
    <Text fw={700} fz="h3" px="md" py="sm" truncate>
      {title}
    </Text>
  );
}
