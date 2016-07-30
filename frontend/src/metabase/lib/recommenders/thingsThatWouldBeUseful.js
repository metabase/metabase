export var TableMetadata = {

	hasSegments(table){
		return true
	},

	getSegments(table){
		return [{name: 'Fake Segment 1', definition: 'XXX'}]
	},

	getFields(table){
		// Fake this out
		return [{id: 1, special_type: 'PK', name: 'id'}, 
				{id: 2, special_type:"FK", name: 'user_id'}, 
				{id: 3, name: "name"},
				{id: 4, name: 'createdAt', base_type:"datetime"},
				{id: 5, name: 'city', special_type:"city"},
				{id: 6, name: 'state', special_type:"state"},
				{id: 7, name: 'country', special_type:"country"},
				{id: 8, name: 'category', special_type:"category"},
				]
	}


}

export var FieldMetadata = {

	isFKorPK(field){
		return field.special_type == "FK" || field.special_type == "PK"
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

	getDashboardsParameterizedBy(fieldID){
		return [{name: 'Fake Dashboard', id: 1}]
	}
}

export var Cards = {
	getCardsParameterizedBy(fieldID){
		return [{name: 'Fake Card', id: 1}]
	}

}