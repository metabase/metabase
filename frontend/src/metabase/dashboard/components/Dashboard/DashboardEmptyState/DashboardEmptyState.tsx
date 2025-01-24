import type { ReactNode } from "react";
import { jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import CS from "metabase/css/core/index.css";
import { Button, Icon, type IconName, Stack, Text, Title } from "metabase/ui";

interface DashboardEmptyStateProps {
  addQuestion?: () => void;
  isDashboardEmpty: boolean;
  isEditing?: boolean;
  isNightMode: boolean;
}

const getDefaultTitle = (isDashboardEmpty: boolean) =>
  isDashboardEmpty ? t`This dashboard is empty` : t`There's nothing here, yet`;

function InlineIcon({ name }: { name: IconName }) {
  return <Icon name={name} style={{ verticalAlign: " middle" }} />;
}

function EmptyStateWrapper({
  isNightMode,
  children,
}: {
  isNightMode: boolean;
  children: ReactNode;
}) {
  return (
    <Stack
      className={CS.flex1}
      align="center"
      color={isNightMode ? "text-white" : "inherit"}
      data-testid="dashboard-empty-state"
      justify="center"
      spacing="lg"
    >
      <img src={EmptyDashboardBot} alt="Empty dashboard illustration" />
      {children}
    </Stack>
  );
}

export function DashboardEmptyState({
  addQuestion,
  isDashboardEmpty,
  isEditing,
  isNightMode,
}: DashboardEmptyStateProps) {
  const defaultTitle = getDefaultTitle(isDashboardEmpty);
  return (
    <EmptyStateWrapper isNightMode={isNightMode}>
      <>
        <Stack align="center" maw="25rem" spacing="xs">
          <Title align="center" order={2}>
            {isEditing
              ? t`Create a new question or browse your collections for an existing one.`
              : defaultTitle}
          </Title>

          <Text align="center" data-testid="dashboard-empty-state-copy">
            {isEditing
              ? jt`Add link or text cards. You can arrange cards manually, or start with some default layouts by adding ${(<InlineIcon key="section-icon" name="section" />)} ${(<b key="section">{t`a section`}</b>)}.`
              : jt`Click on the ${(<InlineIcon key="pencil-icon" name="pencil" />)} ${(<b key="edit">{t`Edit`}</b>)} button to add questions, filters, links, or text.`}
          </Text>
        </Stack>
        <Button
          onClick={addQuestion}
          variant="filled"
          w="12.5rem"
        >{t`Add a chart`}</Button>
      </>
    </EmptyStateWrapper>
  );
}

export function DashboardEmptyStateWithoutAddPrompt({
  isDashboardEmpty,
  isNightMode,
}: DashboardEmptyStateProps) {
  const title = getDefaultTitle(isDashboardEmpty);
  return (
    <EmptyStateWrapper isNightMode={isNightMode}>
      <Title align="center" order={2}>
        {title}
      </Title>
    </EmptyStateWrapper>
  );
}
