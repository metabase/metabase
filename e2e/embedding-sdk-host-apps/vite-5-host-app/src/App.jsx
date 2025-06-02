import {
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import { useMemo } from "react";
import { Redirect, Route, Switch, useSearchParams } from "wouter";

// Configuration
const config = defineMetabaseAuthConfig({
  metabaseInstanceUrl: `http://localhost:${import.meta.env.VITE_MB_PORT}`,
});

const defaultQuestionId = 24;
const defaultDashboardId = 1;

function App() {
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
    <div className="App" style={{ width: "500px", height: "800px" }}>
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
    </div>
  );
}

export default App;
