/* @flow */

class Database {
    newQuery(): Query {}
    newNativeQuery(): NativeQuery {}
}

class Schema {}

class Table {
    newQuery(): Query {}
    newNativeQuery(): NativeQuery {}
}

class Field {}

class Query {
    constructor(metadata: Metadata, datasetQuery: DatasetQuery) {}

    setDatabase(database: Database) {}
    setTable(table: Table) {}

    aggregations(): Aggregation[] {}
    aggregationOptions(): AggregationOption[] {}
    canAddAggregation(): bool {}

    breakouts(): Breakout[] {}
    breakoutOptions(unused: boolean = false): BreakoutOption[] {}
    canAddBreakout(): bool {}

    filters(): Filter[] {}
    filterOptions(): FilterOption[] {}
    canAddFilter(): bool {}

    sorts(): Sort[] {}
    sortOptions(): SortOption[] {}
    canAddSort(): bool {}

    // top-level actions
    actions(): Action[] {}
    // drill-through etc actions
    actionsForClick(clicked: ClickObject): Action[] {}
}

// AGGREGATIONS

class Aggregation {
    displayName: string;
    icon: string;

    remove() {}
    options(): AggregationOption[] {}
}

class AggregationOption {
    displayName: string;
    icon: string;
    section: string;
    isSelected: ?boolean;

    add() {}
}

// TODO: similar for breakout, etc

// ACTIONS / DRILL THROUGHS

class Action {
    perform() {}
}
