import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { Flex } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { DashboardSaveLocation } from "./ViewHeader/components/DashboardSaveLocation";
import type { ViewSectionProps } from "./ViewSection";
import ViewSection, { ViewHeading } from "./ViewSection";

interface NewQuestionHeader extends ViewSectionProps {
  saveToDashboardId: DashboardId | undefined;
}

export function NewQuestionHeader({
  saveToDashboardId,
  ...props
}: NewQuestionHeader) {
  const { data: saveToDashboard } = useGetDashboardQuery(
    saveToDashboardId ? { id: saveToDashboardId } : skipToken,
  );

  return (
    <ViewSection
      {...props}
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
    >
      <Flex direction="column" gap="xs">
        <ViewHeading>{t`Pick your starting data`}</ViewHeading>
        {saveToDashboard && (
          <DashboardSaveLocation dashboardName={saveToDashboard.name} />
        )}
      </Flex>
    </ViewSection>
  );
}
