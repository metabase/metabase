```ts
type NavigatedEntityParameterChangePayload =
  | (ParameterChangePayload & {
      clickParameters: ParameterValues;
      entityId: SdkEntityId;
      navigationId: string;
    } & {
      entityType: "dashboard";
    })
  | (SqlParameterChangePayload & {
      clickParameters: ParameterValues;
      entityId: SdkEntityId;
      navigationId: string;
    } & {
      entityType: "question";
    });
```

Payload passed to `onNavigatedEntityParametersChange` callback.
The root payload of the same entity type, plus `entityType`, `entityId`, `navigationId` and `clickParameters`.
