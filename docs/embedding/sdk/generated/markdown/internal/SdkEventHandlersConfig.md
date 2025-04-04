```ts
type SdkEventHandlersConfig = {
  onDashboardLoad: SdkDashboardLoadEvent;
  onDashboardLoadWithoutCards: SdkDashboardLoadEvent;
};
```

## Properties

### onDashboardLoad?

```ts
optional onDashboardLoad: SdkDashboardLoadEvent;
```

Triggers when a dashboard loads with all visible cards and their content

---

### onDashboardLoadWithoutCards?

```ts
optional onDashboardLoadWithoutCards: SdkDashboardLoadEvent;
```

Triggers after a dashboard loads, but without its cards (at this stage only the dashboard title, tabs, and cards grid are rendered, but the contents of the cards have yet to load.
