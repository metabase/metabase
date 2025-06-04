import {
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import { useMemo } from "react";
import { Redirect, Route, Switch, useSearchParams } from "wouter";

const config = defineMetabaseAuthConfig({
  metabaseInstanceUrl: `http://localhost:${process.env.REACT_APP_MB_PORT}`,
});

const defaultQuestionId = 24;
const defaultDashboardId = 1;

export const App = () => {
  const [searchParams] = useSearchParams();

  const { locale, questionId, dashboardId } = useMemo(
    () => ({
      locale: searchParams.get("locale") ?? undefined,
      questionId: parseInt(searchParams.get("questionId") || defaultQuestionId),
      dashboardId: parseInt(
        searchParams.get("dashboardId") || defaultDashboardId,
      ),
    }),
    [searchParams],
  );

  return (
    <main>
      <MetabaseProvider authConfig={config} locale={locale}>
        <Switch>
          <Route
            path="/"
            component={() => <Redirect to="/interactive-question" />}
          />
          <Route
            path="/interactive-question"
            component={() => <InteractiveQuestion questionId={questionId} />}
          />
          <Route
            path="/interactive-dashboard"
            component={() => (
              <InteractiveDashboard dashboardId={dashboardId} withDownloads />
            )}
          />
        </Switch>
      </MetabaseProvider>
    </main>
  );
};
