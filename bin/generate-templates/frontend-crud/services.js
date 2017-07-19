// ${object_name} services

export const ${ObjectName}Api = {
    // list:                        GET("/api/${object_name}"),
    // create:                     POST("/api/${object_name}"),
    // get:                         GET("/api/${object_name}/:id"),
    // update:                      PUT("/api/${object_name}/:id"),
    // delete:                   DELETE("/api/${object_name}/:id"),

    // TODO: placeholder implementations. replace with API calls above
    list:   ()       => new Promise(r => r(${object_name_plural}.filter(item => item !== undefined))),
    create: (item)   => new Promise(r => r(${object_name_plural}[${object_name_plural}.length] = { ...item, id: ${object_name_plural}.length })),
    get:    ({ id }) => new Promise(r => r(${object_name_plural}[id])),
    update: (item)   => new Promise(r => r(${object_name_plural}[item.id] = item)),
    delete: ({ id }) => new Promise(r => { delete ${object_name_plural}[id]; r(id); }),
};

// TODO: remove this when replacing placeholder implementations above
const ${object_name_plural} = [];
