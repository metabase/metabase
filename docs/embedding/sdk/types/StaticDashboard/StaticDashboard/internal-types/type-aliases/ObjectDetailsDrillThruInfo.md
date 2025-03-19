```ts
type ObjectDetailsDrillThruInfo<Type> = BaseDrillThruInfo<Type> & {
  isManyPks: boolean;
  objectId: string | number;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `isManyPks` | `boolean` |
| `objectId` | `string` \| `number` |

## Type Parameters

| Type Parameter |
| ------ |
| `Type` *extends* [`DrillThruType`](DrillThruType.md) |
