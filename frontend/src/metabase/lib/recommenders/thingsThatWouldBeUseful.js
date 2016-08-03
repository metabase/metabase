export var TableMetadata = {

	hasSegments(table){
		return true
	},

	getSegments(table){
		return [{name: 'Fake Segment 1', definition: 'XXX'}]
	},

	hasMetrics(table){
		return true
	},

	getMetrics(table){
		return [{name: 'Fake Metric 1', definition: 'XXX'}]
	},

	getFields(table){
		// Fake this out
		return[{id: 1, name: 'id', special_type: 'PK'}, 
               {id: 2, name: "name", special_type:"name"},
               {id: 3, name: 'user_id', special_type:"FK"}, 
               {id: 4, name: 'city', special_type:"city"}, 
               {id: 5, name: 'state', special_type:"state"}, 
               {id: 6, name: 'country', special_type:"country"}, 
               {id: 7, name: 'status', special_type:"category"}, 
               {id: 8, name: 'timestamp', base_type:"datetime"}                         ]
	}


}

export var FieldMetadata = {

	isFKorPK(field){
		return field.special_type == "FK" || field.special_type == "PK"
	},

	isFK(field){
		return field.special_type == "FK"
	},

	isTime(field){
		return field.base_type == "datetime"
	},

	isGeo(field){
		return field.special_type == "city" || field.special_type == "state" || field.special_type == "country"
	},

	isCategory(field){
		return field.special_type == "category"
	}


}


export var Dashboards = {

	getDashboardsParameterizedBy(field){
		if (field.special_type == 'PK'){
			return [{name: 'Fake Dashboard', id: 1}]
		} else {
			return []
		}
	}
}

export var Cards = {
	getCardsParameterizedBy(field){
		if (field.special_type == 'PK'){
			return [{name: 'Fake Card', id: 1}]		
		} else {
			return []
		}

	}

}