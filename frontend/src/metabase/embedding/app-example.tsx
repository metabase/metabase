import ReactDOM from "react-dom";
import { MetabaseProvider, QueryVisualizationSdk } from "metabase/embedding";

const METABASE_SITE_URL = "http://localhost:3000";
const METABASE_SECRET_KEY =
  "76d094e583af02b5db17cb0bda40347c0f1eeb8a477490c44565a8adb021b711";
const MOCK_QUESTION_ID = 77;

const init = () => {
  ReactDOM.render(
    <MetabaseProvider
      apiUrl={METABASE_SITE_URL}
      secretKey={METABASE_SECRET_KEY}
    >
      <div>SOME CONTENT FROM CLIENT APP ITSELF</div>

      <QueryVisualizationSdk questionId={MOCK_QUESTION_ID} />
    </MetabaseProvider>,
    document.getElementById("root"),
  );
};

init();
