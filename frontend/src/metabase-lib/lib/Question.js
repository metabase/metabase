/* @flow */

import Query from "./Query";
import Dimension from "./Dimension";
import Parameter from "./Parameter";

import Breakout from "./query/Breakout";
import Filter from "./query/Filter";

import Action, { ActionClick } from "./Action";

import { nyi } from "./utils";

import type { ParameterId } from "metabase/meta/types/Parameter";

// TODO: move these
type DownloadFormat = "csv" | "json" | "xlsx";
type RevisionId = number;
type ParameterOptions = "FIXME";

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
export default class Question {
    /**
     * A question has one or more queries
     */
    queries: Query[];

    /**
     * Question constructor
     */
    constructor() {}

    /**
     * Helper for single query centric cards
     */
    query(): Query {
        return this.queries[0];
    }

    /**
     * Question is valid (as far as we know) and can be executed
     */
    canRun(): boolean {
        for (const query of this.queries) {
            if (!query.canRun()) {
                return false;
            }
        }
        return true;
    }

    // multiple series can be pivoted
    breakouts(): Breakout[] {
        return [];
    }
    breakoutDimensions(unused: boolean = false): Dimension[] {
        return [];
    }
    canAddBreakout(): boolean {
        return false;
    }

    // multiple series can be filtered by shared dimensions
    filters(): Filter[] {
        return [];
    }
    filterableDimensions(): Dimension[] {
        return [];
    }
    canAddFilter(): boolean {
        return false;
    }

    // canAddMetric(): boolean {
    //     return false;
    // }
    // addMetric(datasetQuery: DatasetQuery, dimensionMapping: DimensionMapping): void {
    // }
    // getMetrics(): Query[] {
    //     return this.queries;
    // }
    // removeMetric(metricId: number) {
    // }
    // remapMetricDimension(metricID, newDimensionMapping: DimensionMapping) {
    // }

    // top-level actions
    actions(): Action[] {
        // if this is a single query question, the top level actions are
        // the querys actions
        if (this.queries.length === 1) {
            return this.query().actions();
        } else {
            // do something smart
            return [];
        }
    }

    // drill-through etc actions
    actionsForClick(click: ActionClick): Action[] {
        // if this is a single query question, the top level actions are
        // the querys actions
        if (this.queries.length === 1) {
            return this.query().actions();
        } else {
            // do something smart
            return [];
        }
    }

    // Information
    getUrl(): string {
        return "";
    }
    getLineage(): ?Question {
        return null;
    }

    getPublicUrl(): string {
        return "";
    }
    getDownloadURL(format: DownloadFormat): string {
        return "";
    }

    // These methods require integration with Redux actions or REST API
    update(): Promise<void> {
        return new Promise(() => {});
    }
    save(): Promise<void> {
        return new Promise(() => {});
    }
    revert(revisionId: RevisionId): Promise<void> {
        return new Promise(() => {});
    }
    enablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    disablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    publishAsEmbeddable(): Promise<void> {
        return new Promise(() => {});
    }
    getVersionHistory(): Promise<void> {
        return new Promise(() => {});
    }
    run(): Promise<void> {
        return new Promise(() => {});
    }

    parameters(): Parameter[] {
        return [];
    }
    editableParameters(): Parameter[] {
        return [];
    }

    createParameter(parameter: ParameterOptions) {}
    updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    deleteParameter(id: ParameterId) {}
}
