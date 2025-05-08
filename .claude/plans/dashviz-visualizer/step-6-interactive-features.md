# Interactive Features

## Component Index

```
frontend/src/metabase/visualizer/
├── components/
│   ├── DragOverlay/
│   │   └── DragOverlay.tsx                # Visual feedback during drag
│   ├── Visualizer/
│   │   └── Visualizer.tsx                 # Main component orchestrating drag-and-drop
│   ├── Footer/
│   │   └── Footer.tsx                     # Undo/redo and viz type selection UI
│   ├── VisualizerModal/
│   │   └── VisualizerModal.tsx            # Modal with unsaved changes detection
│   ├── VisualizerUiContext/
│   │   └── VisualizerUiContext.tsx        # UI state management
│   └── TabularPreviewModal/
│       └── TabularPreviewModal.tsx        # Data preview functionality
├── hooks/
│   └── use-visualizer-history.ts          # Undo/redo functionality hook
├── utils/
│   ├── drag-and-drop.ts                   # Drag-and-drop utilities
│   └── click-actions.ts                   # Click behavior handling
└── constants.ts                           # Drag-and-drop identifiers
```

## Feature Summary

The visualizer offers a rich set of interactive features to create a fluid, intuitive user experience:

1. **Drag-and-Drop Interface**: Central to the visualizer is a drag-and-drop system for mapping columns to visualization dimensions
2. **Undo/Redo Capability**: Full history tracking with keyboard shortcuts for undoing and redoing actions
3. **Modal Interaction**: Full-screen modal interface with unsaved changes detection
4. **UI State Management**: Context-based UI state for responsive sidebar toggling and element expansion
5. **Click Behavior Handling**: Special handling of click interactions for drill-through capabilities
6. **Data Preview**: Modal view for previewing data in tabular format

These interactive features combine to create a seamless, responsive environment for building visualizations that feels natural and intuitive to use.

## Drag-and-Drop System

### Core Architecture

The drag-and-drop system is based on the `@dnd-kit/core` library and is structured around several key concepts:

1. **Draggable Items**: Columns and well items that can be dragged
2. **Drop Targets**: Wells and canvas areas that can receive dragged items
3. **Drag Overlay**: Visual feedback showing what's being dragged
4. **State Management**: Redux integration for tracking drag operations

The main implementation is in the `Visualizer` component:

```typescript
return (
  <DndContext
    sensors={[canvasSensor]}
    onDragStart={handleDragStart}
    onDragEnd={handleDragEnd}
    measuring={{
      draggable: {
        measure: isVerticalDraggedItem(draggedItem)
          ? MEASURE_VERTICAL_ITEM
          : MEASURE_HORIZONTAL_ITEM,
      },
    }}
  >
    {/* Component structure */}
    <DragOverlay dropAnimation={null}>
      {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
    </DragOverlay>
  </DndContext>
);
```

### Item Types and Identifiers

The system defines two primary types of draggable items:

```typescript
// From constants.ts
export const DRAGGABLE_ID = {
  COLUMN: "COLUMN",       // Original column from data source
  WELL_ITEM: "WELL_ITEM", // Column already placed in a well
};

export const DROPPABLE_ID = {
  CANVAS_MAIN: "CANVAS_MAIN",
  X_AXIS_WELL: "X_AXIS_WELL",
  Y_AXIS_WELL: "Y_AXIS_WELL",
  PIE_METRIC: "PIE_METRIC_WELL",
  PIE_DIMENSION: "PIE_DIMENSION_WELL",
  SCATTER_BUBBLE_SIZE_WELL: "SCATTER_BUBBLE_SIZE_WELL",
};
```

Type guards help identify dragged items:

```typescript
// From drag-and-drop.ts
export function isDraggedColumnItem(item: DndItem): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isDraggedWellItem(item: DndItem): item is DraggedWellItem {
  return item.data?.current?.type === DRAGGABLE_ID.WELL_ITEM;
}
```

### Drag Event Handling

The drag process flows through these key handlers:

1. **Drag Start**: Captures the dragged item in Redux state
   ```typescript
   const handleDragStart = useCallback(
     (event: DragStartEvent) => {
       if (isValidDraggedItem(event.active)) {
         dispatch(
           setDraggedItem({
             id: event.active.id,
             data: {
               current: event.active.data.current,
             },
           } as DraggedItem),
         );
       }
     },
     [dispatch],
   );
   ```

2. **Drag End**: Processes the drop action through Redux
   ```typescript
   const handleDragEnd = useCallback(
     (event: DragEndEvent) => {
       dispatch(handleDrop(event));
     },
     [dispatch],
   );
   ```

3. **Redux Action**: The `handleDrop` action in the Redux slice processes the drop based on visualization type
   ```typescript
   // In visualizer.slice.ts
   handleDrop: (state, action: PayloadAction<DragEndEvent>) => {
     state.draggedItem = null;

     if (!state.display) {
       return;
     }

     const event = action.payload;

     if (isCartesianChart(state.display)) {
       cartesianDropHandler(state, event, {
         datasetMap: state.datasets as Record<VisualizerDataSourceId, Dataset>,
         dataSourceMap: Object.fromEntries(
           state.cards.map((card) => {
             const dataSource = createDataSource("card", card.id, card.name);
             return [dataSource.id, dataSource];
           }),
         ),
       });
     } else if (state.display === "funnel") {
       funnelDropHandler(state, event);
     } else if (state.display === "pie") {
       pieDropHandler(state, event);
     }
   },
   ```

### Visual Feedback

The `DragOverlay` component provides visual feedback during drag operations:

```typescript
export function DragOverlay({ item }: DragOverlayProps) {
  if (isDraggedColumnItem(item)) {
    return (
      <ColumnsListItem highlightedForDrag column={item.data.current.column} />
    );
  }
  if (isDraggedWellItem(item)) {
    const { column, wellId } = item.data.current;
    return (
      <WellItem
        h={28}
        vertical={wellId === DROPPABLE_ID.Y_AXIS_WELL}
        highlightedForDrag
      >
        {column.display_name}
      </WellItem>
    );
  }
  return null;
}
```

### Special Measurement

The system includes special measurement logic for vertical items to handle rotation:

```typescript
const MEASURE_VERTICAL_ITEM = (node: HTMLElement) => {
  const rect = node.getBoundingClientRect();

  // Account for rotation in vertical wells
  return new DOMRect(
    rect.x + (rect.width - rect.height) / 2,
    rect.y + (rect.height - rect.width) / 2,
    rect.height,
    rect.width,
  );
};
```

## Undo/Redo Functionality

### History Implementation

The undo/redo system is built on `redux-undo`, which tracks state history:

```typescript
// In visualizer.slice.ts
export const reducer = undoable(visualizerSlice.reducer, {
  filter: includeAction([
    initializeVisualizer.fulfilled.type,
    addColumn.type,
    setTitle.type,
    updateSettings.type,
    removeColumn.type,
    setDisplay.type,
    handleDrop.type,
    removeDataSource.type,
    addDataSource.fulfilled.type,
  ]),
  undoType: undo.type,
  redoType: redo.type,
  clearHistoryType: CLEAR_HISTORY,
  ignoreInitialState: true,
});
```

Key aspects:
- Only specified actions are tracked in history
- Actions are grouped to create meaningful undo/redo steps
- `ignoreInitialState` prevents undoing to empty state

### UI Integration

The functionality is exposed through the `useVisualizerHistory` hook:

```typescript
export function useVisualizerHistory() {
  const dispatch = useDispatch();
  return {
    canUndo: useSelector(getCanUndo),
    canRedo: useSelector(getCanRedo),
    undo: () => dispatch(undo()),
    redo: () => dispatch(redo()),
  };
}
```

### Keyboard Shortcuts

The system implements keyboard shortcuts for undo/redo:

```typescript
useEffect(() => {
  const keyPress = (event: KeyboardEvent) => {
    if (event.key !== "z" && event.key !== "Z") {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) {
        if (canRedo) {
          redo();
        }
      } else if (canUndo) {
        undo();
      }
    }
  };

  window.addEventListener("keydown", keyPress);

  return () => {
    window.removeEventListener("keydown", keyPress);
  };
}, [canUndo, canRedo, undo, redo]);
```

This provides:
- Ctrl/Cmd+Z for undo
- Ctrl/Cmd+Shift+Z for redo
- Conditional execution based on state availability

## Modal Interface

### Modal Implementation

The visualizer uses a full-screen modal for editing:

```typescript
<Modal
  opened={open}
  size="100%"
  transitionProps={{ transition: "fade", duration: 200 }}
  withCloseButton={false}
  onClose={onModalClose}
  padding={0}
>
  {open && (
    <Visualizer
      className={S.VisualizerRoot}
      {...otherProps}
      initialDataSources={initialDataSources}
      onClose={onModalClose}
    />
  )}
</Modal>
```

### Unsaved Changes Detection

The modal implements unsaved changes detection to prevent accidental data loss:

```typescript
const isDirty = useSelector(getIsDirty);

const onModalClose = useCallback(() => {
  if (!isDirty) {
    onClose();
    return;
  }

  askConfirmation({
    title: t`Are you sure you want to leave?`,
    message: t`Any unsaved changes will be lost.`,
    confirmButtonText: t`Close`,
    onConfirm: onClose,
  });
}, [askConfirmation, isDirty, onClose]);
```

The `getIsDirty` selector compares current state with the initial state:

```typescript
export const getIsDirty = createSelector(
  [getFirstHistoryItem, getCurrentHistoryItem],
  (initialState, state) => {
    return !!initialState && !_.isEqual(initialState, state);
  },
);
```

### Initialization

The modal automatically initializes the visualizer when opened:

```typescript
useEffect(() => {
  if (open && !wasOpen && initialState) {
    dispatch(initializeVisualizer(initialState));
  }
}, [open, wasOpen, initialState, dispatch]);
```

## UI State Management

### Context-Based UI State

The visualizer uses React Context to manage UI state independently from data state:

```typescript
type VisualizerUiState = {
  isDataSidebarOpen: boolean;
  isVizSettingsSidebarOpen: boolean;
  isSwapAffordanceVisible: boolean;
  expandedDataSources: Record<VisualizerDataSourceId, boolean>;

  setDataSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setVizSettingsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSwapAffordanceVisible: Dispatch<SetStateAction<boolean>>;
  setDataSourceExpanded: (
    sourceId: VisualizerDataSourceId,
    isExpanded: boolean,
  ) => void;
  toggleDataSourceExpanded: (sourceId: VisualizerDataSourceId) => void;
};
```

This provides:
- Independent sidebar open/close state
- Expansion tracking for data sources
- Clean separation from Redux data state

### Responsive UI Behavior

The context implements responsive UI behavior, such as closing sidebars when data is removed:

```typescript
useEffect(() => {
  if (dataSourceCount === 0 && previousDataSourceCount > 0) {
    setVizSettingsSidebarOpen(false);
    setSwapAffordanceVisible(false);
    setExpandedDataSources({});
  }
}, [dataSourceCount, previousDataSourceCount]);
```

### Usage Pattern

Components can access and manipulate UI state through the hook:

```typescript
const { setVizSettingsSidebarOpen } = useVisualizerUi();

// In TSX
<Button
  ml="auto"
  onClick={() => setVizSettingsSidebarOpen((isOpen) => !isOpen)}
>{t`Settings`}</Button>
```

## Click Behavior Handling

### Click Object Transformation

The visualizer implements special handling for click behaviors in visualizations:

```typescript
export function formatVisualizerClickObject(
  clicked: ClickObject,
  originalSeries: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
): ClickObject {
  const object = { ...clicked };

  if (object.column) {
    object.cardId = findColumnCardId(object.column, columnValuesMapping);
    object.column = findRealColumn(
      object.column,
      originalSeries,
      columnValuesMapping,
    );
  }

  // Transform data and dimensions...

  return object;
}
```

This functionality:
- Maps merged visualization columns back to their original sources
- Adds appropriate card IDs for drill-through behaviors
- Ensures clicks work properly in the combined visualization

### Source Column Resolution

A key aspect is resolving the actual column from the source data:

```typescript
function findRealColumn(
  column: DatasetColumn,
  originalSeries: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const [valueSource] = columnValuesMapping[column.name] ?? [];

  if (!valueSource || isDataSourceNameRef(valueSource)) {
    return;
  }

  const cardId = parseDataSourceId(valueSource.sourceId).sourceId;
  const cardSeries = originalSeries.find((series) => series.card.id === cardId);

  return cardSeries?.data?.cols?.find(
    (col) => col.name === valueSource.originalName,
  );
}
```

## Data Preview Functionality

### Tabular Preview

The visualizer implements a tabular preview feature for examining data:

```typescript
export function TabularPreviewModal({
  opened,
  onClose,
}: TabularPreviewModalProps) {
  const series = useSelector(getTabularPreviewSeries);

  if (series.length === 0) {
    return null;
  }

  return (
    <Modal opened={opened} title={t`Preview`} size="xl" onClose={onClose}>
      <Box h="800px">
        <Visualization
          rawSeries={series}
          // TableInteractive crashes when trying to use metabase-lib
          isDashboard
        />
      </Box>
    </Modal>
  );
}
```

### Series Transformation

The selector transforms the current visualization data to a tabular format:

```typescript
export const getTabularPreviewSeries = createSelector(
  [getVisualizerFlatRawSeries],
  (rawSeries) => {
    if (rawSeries.length === 0) {
      return [];
    }
    const [{ card, ...rest }] = rawSeries;
    if (card.display === "table") {
      return rawSeries;
    }
    return [
      {
        ...rest,
        card: {
          display: "table",
          dataset_query: {},
          visualization_settings: {},
        } as Card,
      },
    ];
  },
);
```

This allows users to examine the raw data regardless of the current visualization type.

## Implementation Patterns

### Component Integration

Interactive features are tightly integrated with component architecture:

1. **Container + Provider Pattern**: Main components are wrapped with context providers
   ```typescript
   export const Visualizer = ({
     initialDataSources,
     ...props
   }: VisualizerProps) => {
     return (
       <VisualizerUiProvider initialDataSources={initialDataSources}>
         <VisualizerInner {...props} />
       </VisualizerUiProvider>
     );
   };
   ```

2. **Hook-Based Functionality**: Features exposed through custom hooks
   ```typescript
   export function useVisualizerHistory() {
     const dispatch = useDispatch();
     return {
       canUndo: useSelector(getCanUndo),
       canRedo: useSelector(getCanRedo),
       undo: () => dispatch(undo()),
       redo: () => dispatch(redo()),
     };
   }
   ```

3. **Redux + Context Split**: Data in Redux, UI state in Context
   ```typescript
   // Redux for data
   const display = useSelector(getVisualizationType);
   
   // Context for UI
   const { setVizSettingsSidebarOpen } = useVisualizerUi();
   ```

### Event Handling

Event handling follows consistent patterns:

1. **Callback Creation**: Functions created with `useCallback` to prevent re-renders
   ```typescript
   const handleChangeDisplay = useCallback(
     (nextDisplay: string) => {
       dispatch(setDisplay(nextDisplay as VisualizationDisplay));
     },
     [dispatch],
   );
   ```

2. **Effect Cleanup**: All listeners properly cleaned up
   ```typescript
   useEffect(() => {
     window.addEventListener("keydown", keyPress);
     return () => {
       window.removeEventListener("keydown", keyPress);
     };
   }, [canUndo, canRedo, undo, redo]);
   ```

3. **Event Delegation**: Events flow through React to Redux
   ```typescript
   <DndContext
     sensors={[canvasSensor]}
     onDragStart={handleDragStart}
     onDragEnd={handleDragEnd}
     measuring={{...}}
   >
   ```

### Measuring and Positioning

The system implements custom measuring for correct positioning:

```typescript
const MEASURE_VERTICAL_ITEM = (node: HTMLElement) => {
  const rect = node.getBoundingClientRect();

  return new DOMRect(
    rect.x + (rect.width - rect.height) / 2,
    rect.y + (rect.height - rect.width) / 2,
    rect.height,
    rect.width,
  );
};

const MEASURE_HORIZONTAL_ITEM = (node: HTMLElement) => {
  return node.getBoundingClientRect();
};
```

This accommodates both horizontal and vertical orientations.

## Summary of Interactive Features

The visualizer implements a comprehensive set of interactive features that work together to create a fluid, intuitive user experience:

1. **Drag-and-Drop System**: The core interaction pattern, powered by `@dnd-kit/core`, providing a natural way to map data to visualizations
2. **Undo/Redo History**: Full history tracking with keyboard shortcuts for error recovery and experimentation
3. **Modal Interface**: Full-screen editing with unsaved changes detection to prevent data loss
4. **UI State Management**: Responsive UI behavior through context, separating presentation state from data
5. **Click Handling**: Specialized click object transformation to maintain drill-through capabilities
6. **Data Preview**: Tabular view for examining raw data regardless of visualization type

These features combine to create a seamless environment that makes visualization creation accessible and powerful, balancing ease-of-use with advanced capabilities.