import {
  InteractiveDashboard,
  type MetabasePluginsConfig,
} from "@metabase/embedding-sdk-react";

const dashboardId = 1;

const ExampleBase1 = () => {
  // [<snippet example-base-1>]
  const plugins = {
    dashboard: {
      dashboardCardMenu: {
        withDownloads: true,
        withEditLink: true,
        customItems: [],
      },
    },
  };
  // [<endsnippet example-base-1>]

  return <InteractiveDashboard dashboardId={dashboardId} plugins={plugins} />;
};

const ExampleBase2 = () => (
  // [<snippet example-base-2>]
  <InteractiveDashboard
    dashboardId={1}
    plugins={{
      dashboard: {
        dashboardCardMenu: () => null,
      },
    }}
  />
  // [<endsnippet example-base-2>]
);

const ExampleDefaultActions = () => {
  // [<snippet example-default-actions>]
  const plugins = {
    dashboard: {
      dashboardCardMenu: {
        withDownloads: false,
        withEditLink: false,
        customItems: [],
      },
    },
  };
  // [<endsnippet example-default-actions>]

  return <InteractiveDashboard dashboardId={dashboardId} plugins={plugins} />;
};

// [<snippet example-custom-action-type>]
type DashCardMenuItem = {
  iconName: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};
// [<endsnippet example-custom-action-type>]

const ExampleCustomActions = () => {
  // [<snippet example-custom-actions>]
  const plugins: MetabasePluginsConfig = {
    dashboard: {
      dashboardCardMenu: {
        customItems: [
          {
            iconName: "chevronright",
            label: "Custom action",
            onClick: () => {
              alert(`Custom action clicked`);
            },
          },
          ({ question }) => {
            return {
              iconName: "chevronright",
              label: "Custom action",
              onClick: () => {
                alert(`Custom action clicked ${question?.name}`);
              },
            };
          },
        ],
      },
    },
  };
  // [<endsnippet example-custom-actions>]

  return <InteractiveDashboard dashboardId={dashboardId} plugins={plugins} />;
};

const ExampleCustomActionsMenu = () => {
  // [<snippet example-custom-actions-menu>]
  const plugins: MetabasePluginsConfig = {
    dashboard: {
      dashboardCardMenu: ({ question }) => (
        <button onClick={() => console.log(question.name)}>Click me</button>
      ),
    },
  };
  // [<endsnippet example-custom-actions-menu>]

  return <InteractiveDashboard dashboardId={dashboardId} plugins={plugins} />;
};
