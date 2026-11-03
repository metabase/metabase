```ts
function CollectionBrowser(
  props: {
    collectionId?: SdkBrowserCollectionId;
    EmptyContentComponent?: ComponentType | null;
    onClick?: (item: MetabaseCollectionItem) => void;
    pageSize?: number;
    showDashboardQuestions?: boolean;
    visibleColumns?: CollectionBrowserListColumns[];
    visibleEntityTypes?: ("collection" | "dashboard" | "model" | "question")[];
  } & {
    className?: string;
    style?: CSSProperties;
  },
): Element;
```

A component that allows you to browse collections and their items.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `props`   | \{ `collectionId?`: [`SdkBrowserCollectionId`](./api/SdkBrowserCollectionId.md); `EmptyContentComponent?`: \| [`ComponentType`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L104) \| `null`; `onClick?`: (`item`: [`MetabaseCollectionItem`](./api/MetabaseCollectionItem.md)) => `void`; `pageSize?`: `number`; `showDashboardQuestions?`: `boolean`; `visibleColumns?`: [`CollectionBrowserListColumns`](./api/CollectionBrowserListColumns.md)[]; `visibleEntityTypes?`: (`"collection"` \| `"dashboard"` \| `"model"` \| `"question"`)[]; \} & \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579); \} |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L4240)

<!-- [<endsnippet returns>] -->
