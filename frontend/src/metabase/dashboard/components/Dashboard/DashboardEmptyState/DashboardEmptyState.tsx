import { t } from "ttag";

import Link from "metabase/core/components/Link";
import Button from "metabase/core/components/Button";
import EmptyState from "metabase/components/EmptyState";

import { Container } from "./DashboardEmptyState.styled";

function QuestionIllustration() {
  return <span className="QuestionCircle">?</span>;
}

interface DashboardEmptyStateProps {
  isNightMode: boolean;
  addQuestion: () => void;
  closeNavbar: () => void;
}

export function DashboardEmptyState({
  isNightMode,
  addQuestion,
  closeNavbar,
}: DashboardEmptyStateProps) {
  return (
    <Container isNightMode={isNightMode}>
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
              to="/question/new"
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
