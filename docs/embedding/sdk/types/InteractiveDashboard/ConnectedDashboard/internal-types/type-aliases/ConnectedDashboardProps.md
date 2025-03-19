```ts
type ConnectedDashboardProps = {
  className: string;
  dashboardId: DashboardId;
  downloadsEnabled: boolean;
  isLoading: boolean;
  onNavigateToNewCardFromDashboard: (opts: NavigateToNewCardFromDashboardOpts) => void;
  parameterQueryParams: Query;
  plugins: MetabasePluginsConfig;
 } & DashboardFullscreenControls & DashboardRefreshPeriodControls & DashboardLoaderWrapperProps & PublicOrEmbeddedDashboardEventHandlersProps;
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `className`? | `string` |
| `dashboardId` | [`DashboardId`](../../../../MetabaseProvider/internal-types/type-aliases/DashboardId.md) |
| `downloadsEnabled`? | `boolean` |
| `isLoading` | `boolean` |
| `onNavigateToNewCardFromDashboard` | (`opts`: [`NavigateToNewCardFromDashboardOpts`](NavigateToNewCardFromDashboardOpts.md)) => `void` |
| `parameterQueryParams` | `Query` |
| `plugins`? | [`MetabasePluginsConfig`](../../../../MetabaseProvider/internal-types/type-aliases/MetabasePluginsConfig.md) |
