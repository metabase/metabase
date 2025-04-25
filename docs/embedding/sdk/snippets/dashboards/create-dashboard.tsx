import { useState } from "react";
import {
  CreateDashboardModal,
  EditableDashboard,
  type MetabaseDashboard,
  useCreateDashboardApi,
} from "@metabase/embedding-sdk-react";

const ExampleHook = () => {
  const options = {
    name: "New dashboard",
    description: null,
    collectionId: 1,
  };

  // [<snippet example-hook>]
  const { createDashboard } = useCreateDashboardApi();

  const handleDashboardCreate = async () => {
    const dashboard = await createDashboard(options);

    // do something with created empty dashboard, e.g., use the dashboard in EditableDashboard component
  };

  return <button onClick={handleDashboardCreate}>Create new dashboard</button>;
  // [<endsnippet example-hook>]
};

const ExampleComponent = () => {
  const handleClose = () => {};

  // [<snippet example-component>]
  const [dashboard, setDashboard] = useState<MetabaseDashboard | null>(null);

  if (dashboard) {
    return <EditableDashboard dashboardId={dashboard.id} />;
  }

  return <CreateDashboardModal onClose={handleClose} onCreate={setDashboard} />;
  // [<endsnippet example-component>]
};
