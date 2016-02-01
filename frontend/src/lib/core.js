
export const user_roles = [{
    'id': 'user',
    'name': 'User',
    'description': 'Can do everything except access the Admin Panel.'
}, {
    'id': 'admin',
    'name': 'Admin',
    'description': "Can access the Admin Panel to add or remove users and modify database settings."
}];

export const field_special_types = [{
    'id': 'id',
    'name': 'Entity Key',
    'section': 'Overall Row',
    'description': 'The primary key for this table.'
}, {
    'id': 'name',
    'name': 'Entity Name',
    'section': 'Overall Row',
    'description': 'The "name" of each record. Usually a column called "name", "title", etc.'
}, {
    'id': 'fk',
    'name': 'Foreign Key',
    'section': 'Overall Row',
    'description': 'Points to another table to make a connection.'
}, {
    'id': 'avatar',
    'name': 'Avatar Image URL',
    'section': 'Common'
}, {
    'id': 'category',
    'name': 'Category',
    'section': 'Common'
}, {
    'id': 'city',
    'name': 'City',
    'section': 'Common'
}, {
    'id': 'country',
    'name': 'Country',
    'section': 'Common'
}, {
    'id': 'desc',
    'name': 'Description',
    'section': 'Common'
}, {
    'id': 'image',
    'name': 'Image URL',
    'section': 'Common'
}, {
    'id': 'json',
    'name': 'Field containing JSON',
    'section': 'Common'
}, {
    'id': 'latitude',
    'name': 'Latitude',
    'section': 'Common'
}, {
    'id': 'longitude',
    'name': 'Longitude',
    'section': 'Common'
}, {
    'id': 'number',
    'name': 'Number',
    'section': 'Common'
}, {
    'id': 'state',
    'name': 'State',
    'section': 'Common'
}, {
    id: 'timestamp_seconds',
    name: 'UNIX Timestamp (Seconds)',
    'section': 'Common'
}, {
    id: 'timestamp_milliseconds',
    name: 'UNIX Timestamp (Milliseconds)',
    'section': 'Common'
}, {
    'id': 'url',
    'name': 'URL',
    'section': 'Common'
}, {
    'id': 'zip_code',
    'name': 'Zip Code',
    'section': 'Common'
}];

export const field_field_types = [{
    'id': 'info',
    'name': 'Information',
    'description': 'Non-numerical value that is not meant to be used.'
}, {
    'id': 'metric',
    'name': 'Metric',
    'description': 'A number that can be added, graphed, etc.'
}, {
    'id': 'dimension',
    'name': 'Dimension',
    'description': 'A high or low-cardinality numerical string value that is meant to be used as a grouping.'
}, {
    'id': 'sensitive',
    'name': 'Sensitive Information',
    'description': 'A field that should never be shown anywhere.'
}];

export const field_visibility_types = [{
    'id': 'everywhere',
    'name': 'Everywhere',
    'description': 'The default setting.  This field will be displayed normally in tables and charts.'
}, {
    'id': 'detail_views',
    'name': 'Only in Detail Views',
    'description': "This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart."
}, {
    'id': 'do_not_include',
    'name': 'Do Not Include',
    'description': 'Metabase will never retrieve this field. Use this for sensitive or irrelevant information.'
}];
