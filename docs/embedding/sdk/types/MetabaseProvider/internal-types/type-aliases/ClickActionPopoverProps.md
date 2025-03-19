```ts
type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun;
  onClick: (action: RegularClickAction) => void;
  onClose: () => void;
  onResize: (...args: unknown[]) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  series: Series | null;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="onchangecardandrun"></a> `onChangeCardAndRun` | [`OnChangeCardAndRun`](OnChangeCardAndRun.md) |
| <a id="onclick"></a> `onClick` | (`action`: [`RegularClickAction`](RegularClickAction.md)) => `void` |
| <a id="onclose"></a> `onClose` | () => `void` |
| <a id="onresize"></a> `onResize` | (...`args`: `unknown`[]) => `void` |
| <a id="onupdatevisualizationsettings"></a> `onUpdateVisualizationSettings` | (`settings`: [`VisualizationSettings`](VisualizationSettings.md)) => `void` |
| <a id="series"></a> `series` | [`Series`](Series.md) \| `null` |
