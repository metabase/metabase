import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";

function App() {
  return <h1>Group access app</h1>;
}

const factory: DataAppFactory = () => ({ component: App });

export default factory;
