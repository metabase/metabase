```ts
type SdkDashboardDisplayProps = {
  className: string;
  dashboardId: DashboardId;
  hiddenParameters: string[];
  initialParameters: Query;
  style: CSSProperties;
  withCardTitle: boolean;
  withDownloads: boolean;
  withFooter: boolean;
  withTitle: boolean;
};
```

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="classname"></a> `className`? | `string` | A custom class name to be added to the root element. |
| <a id="dashboardid"></a> `dashboardId` | [`DashboardId`](../../../../MetabaseProvider/internal-types/type-aliases/DashboardId.md) | The ID of the dashboard. This is either: <br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1` <br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| <a id="hiddenparameters"></a> `hiddenParameters`? | `string`[] | A list of parameters to hide ../../embedding/public-links.md#appearance-parameters. |
| <a id="initialparameters"></a> `initialParameters`? | `Query` | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options. |
| <a id="style"></a> `style`? | `CSSProperties` | A custom style object to be added to the root element. |
| <a id="withcardtitle"></a> `withCardTitle`? | `boolean` | Whether the dashboard cards should display a title. |
| <a id="withdownloads"></a> `withDownloads`? | `boolean` | Whether to hide the download button. |
| <a id="withfooter"></a> `withFooter`? | `boolean` | Whether to display the footer. |
| <a id="withtitle"></a> `withTitle`? | `boolean` | Whether the dashboard should display a title. |
