import { jt, t } from "ttag";

import { Text } from "metabase/ui";

import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

export const QueryItem = ({ itemRef }: OnboardingItemProps) => (
  <ChecklistItem
    value="query"
    icon="insight"
    label={t`Query your data`}
    itemRef={itemRef}
  >
    <ChecklistImage
      alt={t`The three ways to query your data, each producing a chart`}
      src="app/assets/img/onboarding_query_methods.svg"
    />
    <Text>
      {jt`Hit the ${(
        <b key="new">{t`+ New`}</b>
      )} button to query your data and create a chart. Pick ${(
        <b key="ai-exploration">{t`AI exploration`}</b>
      )} to create a question in natural language. Pick ${(
        <b key="question">{t`Question`}</b>
      )} to use the query builder and generate a chart people can drill through. Or pick ${(
        <b key="native-query">{t`Native query`}</b>
      )} to create a question with SQL.`}
    </Text>
  </ChecklistItem>
);
