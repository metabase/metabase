export var TableMetadata = {

	hasSegments(table){
		return true
	}

	getSegments(table){
		return [{name: 'Fake Segment 1', definition: 'XXX'}]
	}


}

export var FieldMetadata {

	isFKorPK(field){
		return field.special_type == "FK" || field.special_type == "PK"
	}

}


export var Dashboards = {

	getDashboardsParameterizedBy(fieldID){
		return [{name: 'Fake Dashboard', id: 1, url: 'http://stats.metabase.com/dashboard/1'}]
	}
}

export var Cards = {
	getCardsParameterizedBy(fieldID){
		return [{name: 'Fake Dashboard', id: 1, url: 'http://stats.metabase.com/card/1'}]
	}

}