```ts
type CollectionBrowserProps = {
  className: string;
  collectionId: SdkCollectionId;
  EmptyContentComponent: ComponentType | null;
  onClick: (item: CollectionItem) => void;
  pageSize: number;
  style: CSSProperties;
  visibleColumns: CollectionBrowserListColumns[];
  visibleEntityTypes: UserFacingEntityName[];
};
```

#### Properties

##### className?

```ts
optional className: string;
```

***

##### collectionId?

```ts
optional collectionId: SdkCollectionId;
```

***

##### EmptyContentComponent?

```ts
optional EmptyContentComponent: ComponentType | null;
```

***

##### onClick()?

```ts
optional onClick: (item: CollectionItem) => void;
```

###### Parameters

| Parameter | Type                                           |
| --------- | ---------------------------------------------- |
| `item`    | [`CollectionItem`](internal/CollectionItem.md) |

###### Returns

`void`

***

##### pageSize?

```ts
optional pageSize: number;
```

***

##### style?

```ts
optional style: CSSProperties;
```

***

##### visibleColumns?

```ts
optional visibleColumns: CollectionBrowserListColumns[];
```

***

##### visibleEntityTypes?

```ts
optional visibleEntityTypes: UserFacingEntityName[];
```
