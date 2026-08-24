## InteractiveQuestion

<!-- [<snippet interactivequestion>] -->

<!-- [<endsnippet interactivequestion>] -->

### Breakout()

<!-- [<snippet breakout()>] -->

```ts
Breakout: () =>
  | Element
  | null;
```

**`Function`**

A set of badges for managing data groupings (breakouts).
Uses question context for breakout functionality.

<!-- [<endsnippet breakout()>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### BreakoutDropdown()

<!-- [<snippet breakoutdropdown()>] -->

```ts
BreakoutDropdown: (props: InteractiveQuestionBreakoutDropdownProps) =>
  | Element
  | null;
```

**`Function`**

Dropdown button for the Breakout component.

<!-- [<endsnippet breakoutdropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                            | Description |
| :-------- | :---------------------------------------------------------------------------------------------- | :---------- |
| `props`   | [`InteractiveQuestionBreakoutDropdownProps`](./api/InteractiveQuestionBreakoutDropdownProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### ChartTypeDropdown()

<!-- [<snippet charttypedropdown()>] -->

```ts
ChartTypeDropdown: (props: InteractiveQuestionChartTypeDropdownProps) =>
  Element;
```

**`Function`**

Dropdown for selecting the visualization type (bar chart, line chart, table, etc.).
Automatically updates to show recommended visualization types for the current data.

<!-- [<endsnippet charttypedropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                              | Description |
| :-------- | :------------------------------------------------------------------------------------------------ | :---------- |
| `props`   | [`InteractiveQuestionChartTypeDropdownProps`](./api/InteractiveQuestionChartTypeDropdownProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### ChartTypeSelector()

<!-- [<snippet charttypeselector()>] -->

```ts
ChartTypeSelector: (props: StackProps) => Element;
```

**`Function`**

Detailed chart type selection interface with recommended visualization options.

<!-- [<endsnippet charttypeselector()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                       | Description |
| :-------- | :--------------------------------------------------------- | :---------- |
| `props`   | [`StackProps`](https://v7.mantine.dev/core/stack/?t=props) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### DownloadWidget()

<!-- [<snippet downloadwidget()>] -->

```ts
DownloadWidget: (props: StackProps) =>
  | Element
  | null;
```

**`Function`**

Provides a UI widget for downloading data in different formats (`CSV`, `XLSX`, `JSON`, and `PNG` depending on the visualization).

<!-- [<endsnippet downloadwidget()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                       | Description |
| :-------- | :--------------------------------------------------------- | :---------- |
| `props`   | [`StackProps`](https://v7.mantine.dev/core/stack/?t=props) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### DownloadWidgetDropdown()

<!-- [<snippet downloadwidgetdropdown()>] -->

```ts
DownloadWidgetDropdown: (props: PopoverProps) =>
  | Element
  | null;
```

**`Function`**

Provides a button that contains a dropdown that shows the `DownloadWidget`.

<!-- [<endsnippet downloadwidgetdropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                           | Description |
| :-------- | :------------------------------------------------------------- | :---------- |
| `props`   | [`PopoverProps`](https://v7.mantine.dev/core/popover/?t=props) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### Filter()

<!-- [<snippet filter()>] -->

```ts
Filter: (props: InteractiveQuestionFilterProps) => Element;
```

**`Function`**

A set of interactive filter badges that allow adding, editing, and removing filters.
Displays current filters as badges with an "Add another filter" option.

<!-- [<endsnippet filter()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                        | Description |
| :-------- | :-------------------------------------------------------------------------- | :---------- |
| `props`   | [`InteractiveQuestionFilterProps`](./api/InteractiveQuestionFilterProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### FilterDropdown()

<!-- [<snippet filterdropdown()>] -->

```ts
FilterDropdown: (props: InteractiveQuestionFilterDropdownProps) =>
  | Element
  | null;
```

**`Function`**

A dropdown button for the Filter component.

<!-- [<endsnippet filterdropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                        | Description |
| :-------- | :------------------------------------------------------------------------------------------ | :---------- |
| `props`   | [`InteractiveQuestionFilterDropdownProps`](./api/InteractiveQuestionFilterDropdownProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### QuestionSettings()

<!-- [<snippet questionsettings()>] -->

```ts
QuestionSettings: (props: StackProps) =>
  | Element
  | null;
```

**`Function`**

Settings panel for configuring visualization options like axes, colors, and formatting.
Uses question context for settings.

<!-- [<endsnippet questionsettings()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                       | Description |
| :-------- | :--------------------------------------------------------- | :---------- |
| `props`   | [`StackProps`](https://v7.mantine.dev/core/stack/?t=props) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### QuestionSettingsDropdown()

<!-- [<snippet questionsettingsdropdown()>] -->

```ts
QuestionSettingsDropdown: (
  props?: InteractiveQuestionQuestionSettingsDropdownProps,
) => Element;
```

**`Function`**

Dropdown button that contains the QuestionSettings component.

<!-- [<endsnippet questionsettingsdropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                            | Description |
| :-------- | :-------------------------------------------------------------------------------------------------------------- | :---------- |
| `props?`  | [`InteractiveQuestionQuestionSettingsDropdownProps`](./api/InteractiveQuestionQuestionSettingsDropdownProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### QuestionVisualization()

<!-- [<snippet questionvisualization()>] -->

```ts
QuestionVisualization: (
  props: {
    className?: string;
    style?: CSSProperties;
  } & {
    height?: Height<string | number>;
    width?: Width<string | number>;
  } & {},
) => Element;
```

**`Function`**

The main visualization component that renders the question results as a chart, table, or other visualization type.

<!-- [<endsnippet questionvisualization()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                                                                                                                                                                                                              | Description |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| `props`   | \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579); \} & \{ `height?`: `Height`\<`string` \| `number`\>; `width?`: `Width`\<`string` \| `number`\>; \} & \{ \} |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### ResetButton()

<!-- [<snippet resetbutton()>] -->

```ts
ResetButton: (props?: ButtonProps) =>
  | Element
  | null;
```

**`Function`**

Button to reset question modifications. Only appears when there are unsaved changes to the question.

<!-- [<endsnippet resetbutton()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                  | Description |
| :-------- | :------------------------------------ | :---------- |
| `props?`  | [`ButtonProps`](./api/ButtonProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### SqlParametersList()

<!-- [<snippet sqlparameterslist()>] -->

```ts
SqlParametersList: () =>
  | Element
  | null;
```

**`Function`**

Parameters list for SQL questions

<!-- [<endsnippet sqlparameterslist()>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### Summarize()

<!-- [<snippet summarize()>] -->

```ts
Summarize: () => Element;
```

**`Function`**

Interface for adding and managing data summaries (like counts, sums, averages). Displays as a set of badges.
Uses question context for summarization functionality.

<!-- [<endsnippet summarize()>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

---

<!-- [<endsnippet returns>] -->

### SummarizeDropdown()

<!-- [<snippet summarizedropdown()>] -->

```ts
SummarizeDropdown: (props: InteractiveQuestionSummarizeDropdownProps) =>
  | Element
  | null;
```

**`Function`**

Dropdown button for the Summarize component.

<!-- [<endsnippet summarizedropdown()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                              | Description |
| :-------- | :------------------------------------------------------------------------------------------------ | :---------- |
| `props`   | [`InteractiveQuestionSummarizeDropdownProps`](./api/InteractiveQuestionSummarizeDropdownProps.md) |             |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `null`

---

<!-- [<endsnippet returns>] -->

### Title()

<!-- [<snippet title()>] -->

```ts
Title: (props: {
  className?: string;
  style?: CSSProperties;
}) =>
  | Element
  | undefined;
```

**`Function`**

Displays a title based on the question's state. Shows:

- The question's display name if it's saved
- An auto-generated description for ad-hoc questions (non-native queries)

<!-- [<endsnippet title()>] -->

#### Parameters

<!-- [<snippet parameters>] -->

| Parameter          | Type                                                                                                                                                                                      | Description                                            |
| :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| `props`            | \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579); \} |                                                        |
| `props.className?` | `string`                                                                                                                                                                                  | A custom class name to be added to the root element.   |
| `props.style?`     | [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579)                                          | A custom style object to be added to the root element. |

<!-- [<endsnippet parameters>] -->

#### Returns

<!-- [<snippet returns>] -->

\| [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)
\| `undefined`

<!-- [<endsnippet returns>] -->

## other

<!-- [<snippet other>] -->

<!-- [<endsnippet other>] -->

### AlertsButton()

<!-- [<snippet alertsbutton()>] -->

```ts
AlertsButton: () => Element;
```

<!-- [<endsnippet alertsbutton()>] -->

#### Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

<!-- [<endsnippet returns>] -->
