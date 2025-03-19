Theme configuration for embedded Metabase components.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="colors"></a> `colors?` | [`MetabaseColors`](MetabaseColors.md) | Color palette |
| <a id="components"></a> `components?` | [`DeepPartial`](../type-aliases/DeepPartial.md)\<[`MetabaseComponentTheme`](../type-aliases/MetabaseComponentTheme.md)\> | Component theme options |
| <a id="fontfamily"></a> `fontFamily?` | \| `string` & \{\} \| [`MetabaseFontFamily`](../type-aliases/MetabaseFontFamily.md) | Font family that will be used for all text, it defaults to the instance's default font. |
| <a id="fontsize"></a> `fontSize?` | `string` | Base font size. Supported units are px, em and rem. Defaults to ~14px (0.875em) |
| <a id="lineheight"></a> `lineHeight?` | `string` \| `number` | Base line height |
