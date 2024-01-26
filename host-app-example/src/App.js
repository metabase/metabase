import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import "./App.css";

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
      </header>

      <MetabaseProvider>
        TEST
        <QueryVisualizationSdk id={77} />
      </MetabaseProvider>
    </div>
  );
}

export default App;
