// This is meant to be an encapsulation layer around MBQL query dictionaries
// This can be fairly complicated internally, but the consumer of this api
// shouldn't know anything about our metadata formats


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

    addLimit(int: limit){}

    // SQL 
    getSQL(){}
    convertToSQL(){}


    // top-level actions
    actions(): Action[] {}
    // drill-through etc actions
    actionsForClick(clicked: ClickObject): Action[] {}


    // Run stuff
    run(someReduxAction){}

}

class QueryResult{

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
