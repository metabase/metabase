/* @flow */

import type { DatasetData, Column } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";

export type ActionCreator = (props: ClickActionProps) => ClickAction[]

export type QueryMode = {
    name: string,
    actions: ActionCreator[],
    drills: ActionCreator[]
}

export type HoverData = Array<{ key: string, value: any, col?: Column }>;

export type HoverObject = {
    index?: number,
    axisIndex?: number,
    data?: HoverData,
    element?: ?HTMLElement,
    event?: MouseEvent,
}

export type DimensionValue = {
    value: Value,
    column: Column
};

export type ClickObject = {
    value?: Value,
    column?: Column,
    dimensions?: DimensionValue[],
    event?: MouseEvent,
    element?: HTMLElement,
    seriesIndex?: number,
}

export type ClickAction = {
    title: any, // React Element
    icon?: string,
    popover?: (props: ClickActionPopoverProps) => any, // React Element
    card?: () => ?Card,

    section?: string,
    name?: string,
}

export type ClickActionProps = {
    card: Card,
    tableMetadata: TableMetadata,
    clicked?: ClickObject
}

export type ClickActionPopoverProps = {
    onChangeCardAndRun: (card: ?Card) => void,
    onClose: () => void,
}

// type Visualization = Component<*, VisualizationProps, *>;

// $FlowFixMe
export type Series = { card: Card, data: DatasetData }[] & { _raw: Series }

export type VisualizationProps = {
    series: Series,
    card: Card,
    data: DatasetData,
    settings: VisualizationSettings,

    className?: string,
    gridSize: ?{
        width: number,
        height: number
    },

    showTitle: boolean,
    isDashboard: boolean,
    isEditing: boolean,
    actionButtons: Node,

    hovered: ?HoverObject,
    onHoverChange: (?HoverObject) => void,
    onVisualizationClick: (?ClickObject) => void,
    visualizationIsClickable: (?ClickObject) => boolean,
    onChangeCardAndRun: (card: Card) => void,

    onUpdateVisualizationSettings: ({ [key: string]: any }) => void
}
