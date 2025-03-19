```ts
type QueryClickActionsMode = {
  clickActions: LegacyDrill[];
  fallback: LegacyDrill;
  name: string;
 } & 
  | {
  hasDrills: false;
 }
  | {
  availableOnlyDrills: DrillThruType[];
  hasDrills: true;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `clickActions` | [`LegacyDrill`](LegacyDrill.md)[] |
| `fallback`? | [`LegacyDrill`](LegacyDrill.md) |
| `name` | `string` |
