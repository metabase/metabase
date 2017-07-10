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

export type OnChangeCardAndRun = ({ nextCard: Card, previousCard?: ?Card }) => void

export type ClickActionPopoverProps = {
    onChangeCardAndRun: OnChangeCardAndRun,
    onClose: () => void,
}

export type SingleSeries = { card: Card, data: DatasetData };
export type Series = SingleSeries[] & { _raw: Series }

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

    onRender: ({
        yAxisSplit?: number[][],
        warnings?: string[]
    }) => void,

    hovered: ?HoverObject,
    onHoverChange: (?HoverObject) => void,
    onVisualizationClick: (?ClickObject) => void,
    visualizationIsClickable: (?ClickObject) => boolean,
    onChangeCardAndRun: OnChangeCardAndRun,

    onUpdateVisualizationSettings: ({ [key: string]: any }) => void
}
