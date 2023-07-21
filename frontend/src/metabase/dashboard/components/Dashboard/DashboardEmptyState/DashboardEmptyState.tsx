import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import Button from "metabase/core/components/Button";
import EmptyState from "metabase/components/EmptyState";
import { Dashboard } from "metabase-types/api";
import { Container } from "./DashboardEmptyState.styled";

function QuestionIllustration() {
  return <span className="QuestionCircle">?</span>;
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
              })}
              className="text-bold text-brand"
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

interface TabEmptyStateProps {
  isNightMode: boolean;
}

export function TabEmptyState({ isNightMode }: TabEmptyStateProps) {
  return (
    <Container isNightMode={isNightMode}>
      <EmptyState title={t`There's nothing here, yet.`} />
    </Container>
  );
}
