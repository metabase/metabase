import cx from "classnames";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import type { Dashboard } from "metabase-types/api";

import { Container, QuestionCircleStyled } from "./DashboardEmptyState.styled";

function QuestionIllustration() {
  return <QuestionCircleStyled>?</QuestionCircleStyled>;
}

interface DashboardEmptyStateProps {
  dashboard: Dashboard;
  isNightMode: boolean;
  addQuestion: () => void;
  closeNavbar: () => void;
}

export function DashboardEmptyState({
  dashboard,
  isNightMode,
  addQuestion,
  closeNavbar,
}: DashboardEmptyStateProps) {
  return (
    <Container isNightMode={isNightMode} data-testid="dashboard-empty-state">
      <EmptyState
        illustrationElement={<QuestionIllustration />}
        title={t`This dashboard is looking empty.`}
        message={
          <>
            <Button onlyText onClick={addQuestion}>
              {t`Add a saved question`}
            </Button>
            {t`, or `}
            <Link
              variant="brandBold"
              to={Urls.newQuestion({
                mode: "notebook",
                creationType: "custom_question",
                collectionId: dashboard.collection_id ?? undefined,
                cardType: "question",
              })}
              className={cx(CS.textBold, CS.textBrand)}
              onClick={closeNavbar}
            >
              {t`ask a new one`}
            </Link>
          </>
        }
      />
    </Container>
  );
}

interface DashboardEmptyStateWithoutAddPromptProps {
  isNightMode: boolean;
}

export function DashboardEmptyStateWithoutAddPrompt({
  isNightMode,
}: DashboardEmptyStateWithoutAddPromptProps) {
  return (
    <Container isNightMode={isNightMode}>
      <EmptyState title={t`There's nothing here, yet.`} />
    </Container>
  );
}
