```ts
type PublicOrEmbeddedDashboardEventHandlersProps = {
  onLoad: (dashboard: 
     | Dashboard
     | null) => void;
  onLoadWithoutCards: (dashboard: 
     | Dashboard
     | null) => void;
};
```

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="onload"></a> `onLoad`? | (`dashboard`: \| [`Dashboard`](../../../../MetabaseProvider/internal-types/interfaces/Dashboard.md) \| `null`) => `void` | Callback that is called when the dashboard is loaded. |
| <a id="onloadwithoutcards"></a> `onLoadWithoutCards`? | (`dashboard`: \| [`Dashboard`](../../../../MetabaseProvider/internal-types/interfaces/Dashboard.md) \| `null`) => `void` | Callback that is called when the dashboard is loaded without cards. |
