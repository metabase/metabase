```ts
type SdkEventHandlersConfig = {
  onDashboardLoad?: SdkDashboardLoadEvent;
  onDashboardLoadWithoutCards?: SdkDashboardLoadEvent;
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                                                | Type                                                      | Description                                                                                                                                                                         |
| :---------------------------------------------------------------------- | :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="ondashboardload"></a> `onDashboardLoad?`                         | [`SdkDashboardLoadEvent`](./api/SdkDashboardLoadEvent.md) | Triggers when a dashboard loads with all visible cards and their content                                                                                                            |
| <a id="ondashboardloadwithoutcards"></a> `onDashboardLoadWithoutCards?` | [`SdkDashboardLoadEvent`](./api/SdkDashboardLoadEvent.md) | Triggers after a dashboard loads, but without its cards (at this stage only the dashboard title, tabs, and cards grid are rendered, but the contents of the cards have yet to load. |

<!-- [<endsnippet properties>] -->
