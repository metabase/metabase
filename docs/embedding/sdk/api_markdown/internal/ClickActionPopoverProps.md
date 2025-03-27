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

#### Properties

##### onChangeCardAndRun

```ts
onChangeCardAndRun: OnChangeCardAndRun;
```

***

##### onClick()

```ts
onClick: (action: RegularClickAction) => void;
```

###### Parameters

| Parameter | Type                                                     |
| --------- | -------------------------------------------------------- |
| `action`  | [`RegularClickAction`](./api_html/RegularClickAction.md) |

###### Returns

`void`

***

##### onClose()

```ts
onClose: () => void;
```

###### Returns

`void`

***

##### onResize()

```ts
onResize: (...args: unknown[]) => void;
```

###### Parameters

| Parameter | Type         |
| --------- | ------------ |
| ...`args` | `unknown`\[] |

###### Returns

`void`

***

##### onUpdateVisualizationSettings()

```ts
onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
```

###### Parameters

| Parameter  | Type                                                           |
| ---------- | -------------------------------------------------------------- |
| `settings` | [`VisualizationSettings`](./api_html/VisualizationSettings.md) |

###### Returns

`void`

***

##### series

```ts
series: Series | null;
```
