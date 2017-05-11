// This is a wrapper around the idea of a Question/Card
// The expectation is that in the near future this will be
// extended to include multiple series and queries based on other queries


class Question {

    // a question has one or more queries
    // it currently only has one
    queries[] 
    // helper method for single query centric cards
    query(){return queries[0]} 


    // multiple series can be pivoted
    breakouts(): Breakout[] {}
    breakoutOptions(unused: boolean = false): BreakoutOption[] {}
    canAddBreakout(): bool {}
    
    // multiple series can be filtered by shared dimensions
    filters(): Filter[] {}
    filterOptions(): FilterOption[] {}
    canAddFilter(): bool {}
    
    // multiple series 
    // really only makes sense for metrics (for now)
    addMetric(metric, dimensionMapping){
        // a metric here is either a Metric or a custom metric aka a query
    }
    getMetrics(){
        return queries
    }
    removeMetric(metricID){

    }
    remapMetricDimension(metricID, newDimensionMapping){

    }


    // top-level actions 
    actions(): Action[] {
        // if this is a single query question, the top level actions are
        // the querys actions
        if(queries.length==0){
            return query.actions()
        } else{
            // do something smart
        }
    }
    
    // drill-through etc actions
    actionsForClick(clicked: ClickObject): Action[] {}

    // Information
    getUrl(){}
    getLineage(){}
    getVersionHistory(){}
    revertToVersion(versionIDofSomeKind){}
    getDownloadURL(format){}
    


    // Crud helpers
    save(updatingAction){}

    // Sharing
    enablePublicSharing(){}
    disablePublicSharing(){}
    getPublicUrl(){}
    publishAsEmbeddable(){}

    // Run stuff
    run(someReduxAction){}

    // Parameters
    // Not the this does NOT include any field based filter clauses. 
    getAvailableParameters()    
    setParameter()

    // Parameter maintance
    createParameter(options)
    deleteParameter(parameterID)
}

// Should this be a class method ?
// This is intended to be used to load up a question from the rest API
function getQuestion(questionID){
    return Question(...)
}


class ResultDrill {
    run(x,y){}
}

