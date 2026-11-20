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

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `props`   | \{ `collectionId?`: [`SdkBrowserCollectionId`](/docs/latest/embedding/sdk/api/SdkBrowserCollectionId.md); `EmptyContentComponent?`: \| [`ComponentType`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L124) \| `null`; `onClick?`: (`item`: [`MetabaseCollectionItem`](/docs/latest/embedding/sdk/api/MetabaseCollectionItem.md)) => `void`; `pageSize?`: `number`; `showDashboardQuestions?`: `boolean`; `visibleColumns?`: [`CollectionBrowserListColumns`](/docs/latest/embedding/sdk/api/CollectionBrowserListColumns.md)[]; `visibleEntityTypes?`: (`"collection"` \| `"dashboard"` \| `"model"` \| `"question"`)[]; \} & \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L2571); \} |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L4239)

<!-- [<endsnippet returns>] -->
