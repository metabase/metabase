import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { Flex, Icon, Text } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

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
      <Flex direction="column" gap="sm">
        <ViewHeading>{t`Pick your starting data`}</ViewHeading>
        {saveToDashboard && (
          <Text size="sm" fw="bold" color="text-light">
            <Flex align="center" gap="sm" color="text-light">
              <Icon name="dashboard" size={12} />
              {saveToDashboard?.name}
            </Flex>
          </Text>
        )}
      </Flex>
    </ViewSection>
  );
}
