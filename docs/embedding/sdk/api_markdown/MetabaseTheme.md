Theme configuration for embedded Metabase components.

#### Properties

| Property                              | Type                                                                                                                  | Description                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| <a id="colors"></a> `colors?`         | [`MetabaseColors`](./api_html/MetabaseColors.md)                                                                      | Color palette                                                                           |
| <a id="components"></a> `components?` | [`DeepPartial`](./api_html/internal/DeepPartial.md)<[`MetabaseComponentTheme`](./api_html/MetabaseComponentTheme.md)> | Component theme options                                                                 |
| <a id="fontfamily"></a> `fontFamily?` | `string` & {} \| [`MetabaseFontFamily`](./api_html/internal/MetabaseFontFamily.md)                                    | Font family that will be used for all text, it defaults to the instance's default font. |
| <a id="fontsize"></a> `fontSize?`     | `string`                                                                                                              | Base font size. Supported units are px, em and rem. Defaults to \~14px (0.875em)        |
| <a id="lineheight"></a> `lineHeight?` | `string` \| `number`                                                                                                  | Base line height                                                                        |
