```ts
type SdkDashboardEntityPublicProps =
  | {
      dashboardId: SdkDashboardId | null;
      token?: never;
    }
  | {
      dashboardId?: never;
      token: SdkEntityToken | null;
    };
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

```ts
{
  dashboardId: SdkDashboardId | null;
  token?: never;
}
```

| Name          | Type                                                  | Description                                                                                                                                                                                                                                                                                                                                  |
| :------------ | :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboardId` | [`SdkDashboardId`](./api/SdkDashboardId.md) \| `null` | The ID of the dashboard. <br/> This is either: <br/> - the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1` <br/> - the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| `token?`      | `never`                                               | -                                                                                                                                                                                                                                                                                                                                            |

```ts
{
  dashboardId?: never;
  token: SdkEntityToken | null;
}
```

| Name           | Type                                                  | Description                            |
| :------------- | :---------------------------------------------------- | :------------------------------------- |
| `dashboardId?` | `never`                                               | -                                      |
| `token`        | [`SdkEntityToken`](./api/SdkEntityToken.md) \| `null` | A valid JWT token for the guest embed. |

<!-- [<endsnippet type-declaration>] -->
