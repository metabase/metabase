/* @flow */

import type { DatasetData, Column } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";
import Question from "metabase-lib/lib/Question";

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
    question?: () => ?Question,

    section?: string,
    name?: string,
}

export type ClickActionProps = {
    question: Question,
    clicked?: ClickObject
}

export type ClickActionPopoverProps = {
    onChangeCardAndRun: (card: ?Card) => void,
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

    hovered: ?HoverObject,
    onHoverChange: (?HoverObject) => void,
    onVisualizationClick: (?ClickObject) => void,
    visualizationIsClickable: (?ClickObject) => boolean,
    onChangeCardAndRun: (card: Card) => void,

    onUpdateVisualizationSettings: ({ [key: string]: any }) => void
}
