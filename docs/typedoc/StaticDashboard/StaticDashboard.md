## EmbedDisplayParams

```ts
type EmbedDisplayParams = {
  background: EmbedBackground;
  bordered: boolean;
  cardTitled: EmbedTitle;
  downloadsEnabled: boolean;
  font: EmbedFont;
  getClickActionMode: ClickActionModeGetter;
  hideParameters: EmbedHideParameters;
  theme: DisplayTheme;
  titled: EmbedTitle;
  withFooter: boolean;
};
```

### Type declaration

| Name | Type |
| ------ | ------ |
| <a id="background"></a> `background` | [`EmbedBackground`](../internal.md#embedbackground) |
| <a id="bordered"></a> `bordered` | `boolean` |
| <a id="cardtitled"></a> `cardTitled` | [`EmbedTitle`](../internal.md#embedtitle) |
| <a id="downloadsenabled"></a> `downloadsEnabled` | `boolean` |
| <a id="font"></a> `font` | [`EmbedFont`](../internal.md#embedfont) |
| <a id="getclickactionmode"></a> `getClickActionMode`? | [`ClickActionModeGetter`](../internal.md#clickactionmodegetter) |
| <a id="hideparameters"></a> `hideParameters` | [`EmbedHideParameters`](../internal.md#embedhideparameters) |
| <a id="theme"></a> `theme` | [`DisplayTheme`](../internal.md#displaytheme) |
| <a id="titled"></a> `titled` | [`EmbedTitle`](../internal.md#embedtitle) |
| <a id="withfooter"></a> `withFooter` | `boolean` |

***

## StaticDashboardProps

```ts
type StaticDashboardProps = SdkDashboardDisplayProps & PublicOrEmbeddedDashboardEventHandlersProps;
```
