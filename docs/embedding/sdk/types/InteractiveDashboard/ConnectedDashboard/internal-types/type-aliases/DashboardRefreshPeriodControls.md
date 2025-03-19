```ts
type DashboardRefreshPeriodControls = {
  onRefreshPeriodChange: (newPeriod: RefreshPeriod) => void;
  refreshPeriod: RefreshPeriod;
  setRefreshElapsedHook: (hook: DashboardRefreshPeriodControls["onRefreshPeriodChange"]) => void;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="onrefreshperiodchange"></a> `onRefreshPeriodChange` | (`newPeriod`: [`RefreshPeriod`](RefreshPeriod.md)) => `void` |
| <a id="refreshperiod"></a> `refreshPeriod` | [`RefreshPeriod`](RefreshPeriod.md) |
| <a id="setrefreshelapsedhook"></a> `setRefreshElapsedHook` | (`hook`: [`DashboardRefreshPeriodControls`](DashboardRefreshPeriodControls.md)\[`"onRefreshPeriodChange"`\]) => `void` |
