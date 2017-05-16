/* @flow */

import { nyi } from "../utils";

export default class Aggregation {
    displayName: string;
    icon: string;

    @nyi remove() {}
    @nyi options(): AggregationOption[] {
        return [];
    }
}

export class AggregationOption {
    displayName: string;
    icon: string;
    section: string;
    isSelected: ?boolean;

    @nyi add() {}
}
