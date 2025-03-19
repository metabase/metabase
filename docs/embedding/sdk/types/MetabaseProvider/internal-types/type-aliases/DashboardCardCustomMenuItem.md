```ts
type DashboardCardCustomMenuItem = {
  customItems: (
     | DashCardMenuItem
     | CustomDashboardCardMenuItem)[];
  withDownloads: boolean;
  withEditLink: boolean;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="customitems"></a> `customItems`? | ( \| [`DashCardMenuItem`](DashCardMenuItem.md) \| [`CustomDashboardCardMenuItem`](CustomDashboardCardMenuItem.md))[] |
| <a id="withdownloads"></a> `withDownloads`? | `boolean` |
| <a id="witheditlink"></a> `withEditLink`? | `boolean` |
