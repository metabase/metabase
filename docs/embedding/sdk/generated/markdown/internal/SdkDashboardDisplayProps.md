```ts
type SdkDashboardDisplayProps = {
  className: string;
  dashboardId: SdkDashboardId;
  hiddenParameters: string[];
  initialParameters: Query;
  style: CSSProperties;
  withCardTitle: boolean;
  withDownloads: boolean;
  withFooter: boolean;
  withTitle: boolean;
};
```

#### Properties

##### className?

```ts
optional className: string;
```

A custom class name to be added to the root element.

***

##### dashboardId

```ts
dashboardId: SdkDashboardId;
```

The ID of the dashboard. This is either: <br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1` <br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data

***

##### hiddenParameters?

```ts
optional hiddenParameters: string[];
```

A list of [parameters to hide](../public-links.md#appearance-parameters).

###### Remarks

* Combining [initialParameters](../InteractiveDashboardProps.md#initialparameters) and [hiddenParameters](../InteractiveDashboardProps.md#hiddenparameters) to filter data on the frontend is a [security risk](./authentication.md#security-warning-each-end-user-must-have-their-own-metabase-account).
* Combining [initialParameters](../InteractiveDashboardProps.md#initialparameters) and [hiddenParameters](../InteractiveDashboardProps.md#hiddenparameters) to declutter the user interface is fine.

***

##### initialParameters?

```ts
optional initialParameters: Query;
```

Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.\\

###### Remarks

* Combining [initialParameters](../InteractiveDashboardProps.md#initialparameters) and [hiddenParameters](../InteractiveDashboardProps.md#hiddenparameters) to filter data on the frontend is a [security risk](./authentication.md#security-warning-each-end-user-must-have-their-own-metabase-account).
* Combining [initialParameters](../InteractiveDashboardProps.md#initialparameters) and [hiddenParameters](../InteractiveDashboardProps.md#hiddenparameters) to declutter the user interface is fine.

***

##### style?

```ts
optional style: CSSProperties;
```

A custom style object to be added to the root element.

***

##### withCardTitle?

```ts
optional withCardTitle: boolean;
```

Whether the dashboard cards should display a title.

***

##### withDownloads?

```ts
optional withDownloads: boolean;
```

Whether to hide the download button.

***

##### withFooter?

```ts
optional withFooter: boolean;
```

Whether to display the footer.

***

##### withTitle?

```ts
optional withTitle: boolean;
```

Whether the dashboard should display a title.
