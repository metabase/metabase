import { t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import type Question from "metabase-lib/v1/Question";

import { ModelUsageDetails } from "./ModelUsageDetails";
import { TablesLinkedToQuestion } from "./TablesLinkedToQuestion";

export const QuestionRelationships = ({ question }: { question: Question }) => (
  <>
    {question.type() === "model" && (
      <SidebarSection title={t`Used by`}>
        <ModelUsageDetails model={question} />
      </SidebarSection>
    )}
    <SidebarSection title={t`Linked tables`}>
      <TablesLinkedToQuestion />
    </SidebarSection>
  </>
);
