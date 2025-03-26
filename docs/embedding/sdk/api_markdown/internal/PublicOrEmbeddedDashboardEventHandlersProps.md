```ts
type PublicOrEmbeddedDashboardEventHandlersProps = {
  onLoad: (dashboard: MetabaseDashboard | null) => void;
  onLoadWithoutCards: (dashboard: MetabaseDashboard | null) => void;
};
```

## Properties

### onLoad()?

```ts
optional onLoad: (dashboard: MetabaseDashboard | null) => void;
```

Callback that is called when the dashboard is loaded.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dashboard` | [`MetabaseDashboard`](../MetabaseDashboard.md) \| `null` |

#### Returns

`void`

***

### onLoadWithoutCards()?

```ts
optional onLoadWithoutCards: (dashboard: MetabaseDashboard | null) => void;
```

Callback that is called when the dashboard is loaded without cards.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dashboard` | [`MetabaseDashboard`](../MetabaseDashboard.md) \| `null` |

#### Returns

`void`
