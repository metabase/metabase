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
    @nyi breakouts(): Breakout[] {
        return [];
    }
    @nyi breakoutDimensions(unused: boolean = false): Dimension[] {
        return [];
    }
    @nyi canAddBreakout(): boolean {
        return false;
    }

    // multiple series can be filtered by shared dimensions
    @nyi filters(): Filter[] {
        return [];
    }
    @nyi filterableDimensions(): Dimension[] {
        return [];
    }
    @nyi canAddFilter(): boolean {
        return false;
    }

    // @nyi canAddMetric(): boolean {
    //     return false;
    // }
    // @nyi addMetric(datasetQuery: DatasetQuery, dimensionMapping: DimensionMapping): void {
    // }
    // @nyi getMetrics(): Query[] {
    //     return this.queries;
    // }
    // @nyi removeMetric(metricId: number) {
    // }
    // @nyi remapMetricDimension(metricID, newDimensionMapping: DimensionMapping) {
    // }

    // top-level actions
    @nyi actions(): Action[] {
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
    @nyi actionsForClick(click: ActionClick): Action[] {
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
    @nyi getUrl(): string {
        return "";
    }
    @nyi getLineage(): ?Question {
        return null;
    }

    @nyi getPublicUrl(): string {
        return "";
    }
    @nyi getDownloadURL(format: DownloadFormat): string {
        return "";
    }

    // These methods require integration with Redux actions or REST API
    @nyi update(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi save(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi revert(revisionId: RevisionId): Promise<void> {
        return new Promise(() => {});
    }
    @nyi enablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi disablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi publishAsEmbeddable(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi getVersionHistory(): Promise<void> {
        return new Promise(() => {});
    }
    @nyi run(): Promise<void> {
        return new Promise(() => {});
    }

    @nyi parameters(): Parameter[] {
        return [];
    }
    @nyi editableParameters(): Parameter[] {
        return [];
    }

    @nyi createParameter(parameter: ParameterOptions) {}
    @nyi updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    @nyi deleteParameter(id: ParameterId) {}
}
