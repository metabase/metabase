/* @flow weak */

export default class Aggregation {
    displayName: string;
    icon: string;

    remove() {}
    options(): AggregationOption[] {
        return [];
    }
}

export class AggregationOption {
    displayName: string;
    icon: string;
    section: string;
    isSelected: ?boolean;

    add() {}
}
