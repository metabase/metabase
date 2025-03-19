```ts
type ColumnDisplayInfo = {
  breakoutPositions: number[];
  description: string;
  displayName: string;
  effectiveType: string;
  filterPositions: number[];
  fingerprint: FingerprintDisplayInfo;
  isAggregation: boolean;
  isBreakout: boolean;
  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  longDisplayName: string;
  name: string;
  orderByPosition: number;
  selected: boolean;
  semanticType: string | null;
  table: TableInlineDisplayInfo;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="breakoutpositions"></a> `breakoutPositions`? | `number`[] |
| <a id="description"></a> `description`? | `string` |
| <a id="displayname"></a> `displayName` | `string` |
| <a id="effectivetype"></a> `effectiveType` | `string` |
| <a id="filterpositions"></a> `filterPositions`? | `number`[] |
| <a id="fingerprint"></a> `fingerprint`? | [`FingerprintDisplayInfo`](FingerprintDisplayInfo.md) |
| <a id="isaggregation"></a> `isAggregation` | `boolean` |
| <a id="isbreakout"></a> `isBreakout` | `boolean` |
| <a id="iscalculated"></a> `isCalculated` | `boolean` |
| <a id="isfromjoin"></a> `isFromJoin` | `boolean` |
| <a id="isimplicitlyjoinable"></a> `isImplicitlyJoinable` | `boolean` |
| <a id="longdisplayname"></a> `longDisplayName` | `string` |
| <a id="name"></a> `name` | `string` |
| <a id="orderbyposition"></a> `orderByPosition`? | `number` |
| <a id="selected"></a> `selected`? | `boolean` |
| <a id="semantictype"></a> `semanticType` | `string` \| `null` |
| <a id="table"></a> `table`? | [`TableInlineDisplayInfo`](TableInlineDisplayInfo.md) |
