// This is meant to be the primary way people interact with databases/tables/etc

class Database {
    newQuery(): Query {}
    newNativeQuery(): NativeQuery {}

    // how does this sound for any collection?
    // return list of schema or tables?
    list(){}
    // or
    getSchema(){}
    getTables(){}

}

class Schema {
	// Does it make sense to *always* structure the frontend's copy of the database's tables to have a schema?
	// if a database doesn't have namespaces it's just referred to as "public"
	list(){}
    // or
    getTables(){}
}

class Table {
    newQuery(): Query {}
 	
 	// Do we actually need this?
    newNativeQuery(): NativeQuery {}

    list(){}
    // or
    getFields(){}

}

class Field {
	getColumnDrills(){}
}