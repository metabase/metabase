```ts
type DatabasePermissions = {
  create-queries: NativePermissions;
  data-model: DataModelPermissions;
  details: DetailsPermissions;
  download: DownloadAccessPermission;
  view-data: SchemasPermissions;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="create-queries"></a> `create-queries`? | [`NativePermissions`](NativePermissions.md) |
| <a id="data-model"></a> `data-model`? | [`DataModelPermissions`](DataModelPermissions.md) |
| <a id="details"></a> `details`? | [`DetailsPermissions`](DetailsPermissions.md) |
| <a id="download"></a> `download`? | [`DownloadAccessPermission`](DownloadAccessPermission.md) |
| <a id="view-data"></a> `view-data` | [`SchemasPermissions`](SchemasPermissions.md) |
