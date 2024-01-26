import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import logo from "./logo.svg";
import "./App.css";

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
      </header>

      <MetabaseProvider>
        <QueryVisualizationSdk />
      </MetabaseProvider>
    </div>
  );
}

export default App;
