```ts
type SegmentListItem = SegmentDisplayInfo & {
  displayName: string;
  name: string;
  segment: SegmentMetadata;
  stageIndex: number;
};
```

#### Type declaration

| Name          | Type                                                     |
| ------------- | -------------------------------------------------------- |
| `displayName` | `string`                                                 |
| `name`        | `string`                                                 |
| `segment`     | [`SegmentMetadata`](./generated/html/SegmentMetadata.md) |
| `stageIndex`  | `number`                                                 |
