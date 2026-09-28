```ts
type MetabaseGlobalPluginsConfig = MetabasePluginsConfig & {
  getNoDataIllustration?: () => string | null | undefined;
  getNoObjectIllustration?: () => string | null | undefined;
  handleLink?: (url: string) => {
    handled: boolean;
  };
};
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

| Name                         | Type                                             | Description                                                                                              |
| :--------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `getNoDataIllustration()?`   | () => `string` \| `null` \| `undefined`          | Provides a custom illustration to display when there is no data.                                         |
| `getNoObjectIllustration()?` | () => `string` \| `null` \| `undefined`          | Provides a custom illustration to display when there is no object (e.g., no dashboards, no collections). |
| `handleLink()?`              | (`url`: `string`) => \{ `handled`: `boolean`; \} | -                                                                                                        |

<!-- [<endsnippet type-declaration>] -->
