import type { ReactNode } from "react";
import { c, jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import CS from "metabase/css/core/index.css";
import { Button, Icon, type IconName, Stack, Text, Title } from "metabase/ui";

interface DashboardEmptyStateProps {
  addQuestion?: () => void;
  isDashboardEmpty: boolean;
  isEditing?: boolean;
  isNightMode: boolean;
  canCreateQuestions?: boolean;
}

const getDefaultTitle = (isDashboardEmpty: boolean) =>
  isDashboardEmpty ? t`This dashboard is empty` : t`There's nothing here, yet`;

function InlineIcon({ name }: { name: IconName }) {
  return <Icon name={name} style={{ verticalAlign: "middle" }} />;
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
      align="center"
      color={isNightMode ? "text-white" : "inherit"}
      data-testid="dashboard-empty-state"
      h="100%"
      justify="center"
      gap="lg"
      mih="20rem"
    >
      <img src={EmptyDashboardBot} alt={t`Empty dashboard illustration`} />
      {children}
    </Stack>
  );
}

export function DashboardEmptyState({
  addQuestion,
  isDashboardEmpty,
  isEditing,
  isNightMode,
  canCreateQuestions,
}: DashboardEmptyStateProps) {
  let title = getDefaultTitle(isDashboardEmpty);
  if (isEditing) {
    title = canCreateQuestions
      ? t`Create a new question or browse your collections for an existing one.`
      : t`Browse your collections to find and add existing questions.`;
  }

  return (
    <EmptyStateWrapper isNightMode={isNightMode}>
      <>
        <Stack align="center" maw="25rem" gap="xs">
          <Title ta="center" order={3}>
            {title}
          </Title>

          <Text ta="center" data-testid="dashboard-empty-state-copy">
            {isEditing
              ? jt`Add link or text cards. You can arrange cards manually, or start with some default layouts by adding ${(<InlineIcon key="section-icon" name="section" />)} ${(
                  <b key="section">{c(
                    "Context for languages with declension: 'start [populating a dashboard] with some default layouts by adding >>a section<<",
                  ).t`a section`}</b>
                )}.`
              : jt`Click on the ${(<InlineIcon key="pencil-icon" name="pencil" />)} ${(<b key="edit">{c("The name of a button").t`Edit`}</b>)} button to add questions, filters, links, or text.`}
          </Text>
        </Stack>
        <Button
          className={CS.flexNoShrink}
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
      <Title ta="center" order={3}>
        {title}
      </Title>
    </EmptyStateWrapper>
  );
}
