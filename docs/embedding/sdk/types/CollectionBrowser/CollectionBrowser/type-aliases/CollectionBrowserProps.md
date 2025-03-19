```ts
type CollectionBrowserProps = {
  className: string;
  collectionId: SDKCollectionReference;
  EmptyContentComponent: ComponentType | null;
  onClick: (item: CollectionItem) => void;
  pageSize: number;
  style: CSSProperties;
  visibleColumns: CollectionBrowserListColumns[];
  visibleEntityTypes: UserFacingEntityName[];
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="classname"></a> `className`? | `string` |
| <a id="collectionid"></a> `collectionId`? | [`SDKCollectionReference`](../../../InteractiveQuestion/InteractiveQuestion/internal-types/type-aliases/SDKCollectionReference.md) |
| <a id="emptycontentcomponent"></a> `EmptyContentComponent`? | `ComponentType` \| `null` |
| <a id="onclick"></a> `onClick`? | (`item`: [`CollectionItem`](../internal-types/interfaces/CollectionItem.md)) => `void` |
| <a id="pagesize"></a> `pageSize`? | `number` |
| <a id="style"></a> `style`? | `CSSProperties` |
| <a id="visiblecolumns"></a> `visibleColumns`? | [`CollectionBrowserListColumns`](../internal-types/type-aliases/CollectionBrowserListColumns.md)[] |
| <a id="visibleentitytypes"></a> `visibleEntityTypes`? | [`UserFacingEntityName`](../internal-types/type-aliases/UserFacingEntityName.md)[] |
