```ts
type FileUpload = {
  collectionId: CollectionId;
  error: string;
  id: number;
  message: string;
  modelId: string;
  name: string;
  status: "complete" | "in-progress" | "error";
  tableId: TableId;
  uploadMode: UploadMode;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="collectionid"></a> `collectionId`? | [`CollectionId`](CollectionId.md) |
| <a id="error"></a> `error`? | `string` |
| <a id="id"></a> `id` | `number` |
| <a id="message"></a> `message`? | `string` |
| <a id="modelid"></a> `modelId`? | `string` |
| <a id="name"></a> `name` | `string` |
| <a id="status"></a> `status` | `"complete"` \| `"in-progress"` \| `"error"` |
| <a id="tableid"></a> `tableId`? | [`TableId`](TableId.md) |
| <a id="uploadmode"></a> `uploadMode`? | `UploadMode` |
