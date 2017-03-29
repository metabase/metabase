/* @flow */

import type { Value, Column } from "metabase/meta/types/Dataset";

export type DrillClick = {
    value: Value,
    column: Column,
    metricValue?: Value,
    metricColumn?: Column,
    event?: MouseEvent,
    element?: HTMLElement
};
