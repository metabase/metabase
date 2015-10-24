/*global exports*/

import _ from "underscore";

(function() {

    this.user_roles = [{
        'id': 'user',
        'name': 'Usuário',
        'description': 'Pode fazer tudo, exceto acessar o Painel de Administração.'
    }, {
        'id': 'admin',
        'name': 'Administrador',
        'description': "Pode acessar o painel de administração para adicionar ou remover usuários e modificar as configurações de banco de dados."
    }];

    this.perms = [{
        'id': 0,
        'name': 'Particular'
    }, {
        'id': 1,
        'name': 'Público (outros podem ler)'
    }];

    this.permName = function(permId) {
        if (permId >= 0 && permId <= (this.perms.length - 1)) {
            return this.perms[permId].name;
        }
        return null;
    };

    this.charts = [{
        'id': 'scalar',
        'name': 'Escalar'
    }, {
        'id': 'table',
        'name': 'Tabela'
    }, {
        'id': 'pie',
        'name': 'Gráfico de pizza'
    }, {
        'id': 'bar',
        'name': 'Gráfico de barras'
    }, {
        'id': 'line',
        'name': 'Gráfico de linhas'
    }, {
        'id': 'area',
        'name': 'Gráfico de área'
    }, {
        'id': 'timeseries',
        'name': 'Série temporal'
    }, {
        'id': 'pin_map',
        'name': 'Mapa de vetor'
    }, {
        'id': 'country',
        'name': 'Mapa de calor mundial'
    }, {
        'id': 'state',
        'name': 'Mapa de calor regional'
    }];

    this.chartName = function(chartId) {
        for (var i = 0; i < this.charts.length; i++) {
            if (this.charts[i].id == chartId) {
                return this.charts[i].name;
            }
        }
        return null;
    };

    this.table_entity_types = [{
        'id': null,
        'name': 'Nenhum'
    }, {
        'id': 'person',
        'name': 'Pessoa'
    }, {
        'id': 'event',
        'name': 'Evento'
    }, {
        'id': 'photo',
        'name': 'Foto'
    }, {
        'id': 'place',
        'name': 'Lugar'
    }, {
        'id': 'evt-cohort',
        'name': 'Cohorts-compatible Event'
    }];

    this.tableEntityType = function(typeId) {
        for (var i = 0; i < this.table_entity_types.length; i++) {
            if (this.table_entity_types[i].id == typeId) {
                return this.table_entity_types[i].name;
            }
        }
        return null;
    };

    this.field_special_types = [{
        'id': 'id',
        'name': 'Chave primária',
        'section': 'Registros gerais',
        'description': 'The primary key for this table.'
    }, {
        'id': 'name',
        'name': 'Nome',
        'section': 'Registros gerais',
        'description': 'O "nome" de cada registro. Geralmente uma coluna chamada "nome", "titulo", etc.'
    }, {
        'id': 'fk',
        'name': 'Chave estrangeira',
        'section': 'Registros gerais',
        'description': 'Ponto para outra tabela criar uma relação'
    }, {
        'id': 'avatar',
        'name': 'URL da imagem de Avatar',
        'section': 'Geral'
    }, {
        'id': 'category',
        'name': 'Categoria',
        'section': 'Geral'
    }, {
        'id': 'city',
        'name': 'Cidade',
        'section': 'Geral'
    }, {
        'id': 'country',
        'name': 'País',
        'section': 'Geral'
    }, {
        'id': 'desc',
        'name': 'Descrição',
        'section': 'Geral'
    }, {
        'id': 'image',
        'name': 'URL da imagem',
        'section': 'Geral'
    }, {
        'id': 'json',
        'name': 'Arquivo JSON',
        'section': 'Geral'
    }, {
        'id': 'latitude',
        'name': 'Latitude',
        'section': 'Geral'
    }, {
        'id': 'longitude',
        'name': 'Longitude',
        'section': 'Geral'
    }, {
        'id': 'number',
        'name': 'Número',
        'section': 'Geral'
    }, {
        'id': 'state',
        'name': 'Estado',
        'section': 'Geral'
    }, {
        id: 'timestamp_seconds',
        name: 'UNIX Timestamp (segundos)',
        'section': 'Geral'
    }, {
        id: 'timestamp_milliseconds',
        name: 'UNIX Timestamp (milissegundos)',
        'section': 'Geral'
    }, {
        'id': 'url',
        'name': 'URL',
        'section': 'Geral'
    }, {
        'id': 'zip_code',
        'name': 'CEP',
        'section': 'Geral'
    }];

    this.field_field_types = [{
        'id': 'info',
        'name': 'Informação',
        'description': 'Valor não numérico, que não se destina a ser utilizado.'
    }, {
        'id': 'metric',
        'name': 'Métrica',
        'description': 'Um número que pode ser adicionado, graficamente, etc.'
    }, {
        'id': 'dimension',
        'name': 'Dimensão',
        'description': 'Um valor de cadeia numérica de elevada ou baixa cardinalidade que se destina a ser usado como um agrupamento.'
    }, {
        'id': 'sensitive',
        'name': 'Informação sensível',
        'description': 'Um campo que nunca deve ser mostrado em qualquer lugar.'
    }];

    this.field_visibility_types = [{
        'id': 'everywhere',
        'name': 'Padrão',
        'description': 'A configuração padrão. Este campo será exibido normalmente em tabelas e gráficos.'
    }, {
        'id': 'detail_views',
        'name': 'Apenas visões detalhadas',
        'description': "Este campo só será exibido ao visualizar os detalhes de um único registro. Utilize esta informação para que seja longa ou que não é útil em uma tabela ou gráfico."
    }, {
        'id': 'do_not_include',
        'name': 'Não incluir',
        'description': 'Metabase nunca vai recuperar esse campo. Utilize este para obter informações sensíveis ou irrelevante.'
    }];

    this.boolean_types = [{
        'id': true,
        'name': 'Sim'
    }, {
        'id': false,
        'name': 'Não'
    }, ];

    this.fieldSpecialType = function(typeId) {
        for (var i = 0; i < this.field_special_types.length; i++) {
            if (this.field_special_types[i].id == typeId) {
                return this.field_special_types[i].name;
            }
        }
        return null;
    };

    this.builtinToChart = {
        'latlong_heatmap': 'll_heatmap'
    };

    this.getTitleForBuiltin = function(viewtype, field1Name, field2Name) {
        var builtinToTitleMap = {
            'state': 'Mapa de calor regional',
            'country': 'Mapa de calor nacional',
            'pin_map': 'Mapa de pontos',
            'heatmap': 'Mapa de calor',
            'cohorts': 'Cohorts',
            'latlong_heatmap': 'Mapa de calor (lat/long)'
        };

        var title = builtinToTitleMap[viewtype];
        if (field1Name) {
            title = title.replace("{0}", field1Name);
        }
        if (field2Name) {
            title = title.replace("{1}", field2Name);
        }

        return title;
    };

    this.createLookupTables = function(table) {
        // Create lookup tables (ported from ExploreTableDetailData)

        table.fields_lookup = {};
        _.each(table.fields, function(field) {
            table.fields_lookup[field.id] = field;
            field.operators_lookup = {};
            _.each(field.valid_operators, function(operator) {
                field.operators_lookup[operator.name] = operator;
            });
        });
    };

    // The various DB engines we support <3
    // TODO - this should probably come back from the API, no?
    //
    // NOTE:
    // A database's connection details is stored in a JSON map in the field database.details.
    //
    // ENGINE DICT FORMAT:
    // *  name         - human-facing name to use for this DB engine
    // *  fields       - array of available fields to display when a user adds/edits a DB of this type. Each field should be a dict of the format below:
    //
    // FIELD DICT FORMAT:
    // *  displayName          - user-facing name for the Field
    // *  fieldName            - name used for the field in a database details dict
    // *  transform            - function to apply to this value before passing to the API, such as 'parseInt'. (default: none)
    // *  placeholder          - placeholder value that should be used in text input for this field (default: none)
    // *  placeholderIsDefault - if true, use the value of 'placeholder' as the default value of this field if none is specified (default: false)
    //                           (if you set this, don't set 'required', or user will still have to add a value for the field)
    // *  required             - require the user to enter a value for this field? (default: false)
    // *  choices              - array of possible values for this field. If provided, display a button toggle instead of a text input.
    //                           Each choice should be a dict of the format below: (optional)
    //
    // CHOICE DICT FORMAT:
    // *  name            - User-facing name for the choice.
    // *  value           - Value to use for the choice in the database connection details dict.
    // *  selectionAccent - What accent type should be applied to the field when its value is chosen? Either 'active' (currently green), or 'danger' (currently red).
    this.ENGINES = {
        postgres: {
            name: 'PostgreSQL',
            fields: [{
                displayName: "Endereço",
                fieldName: "host",
                type: "text",
                placeholder: "localhost",
                placeholderIsDefault: true
            }, {
                displayName: "Porta",
                fieldName: "port",
                type: "text",
                transform: parseInt,
                placeholder: "5432",
                placeholderIsDefault: true
            }, {
                displayName: "Nome da base",
                fieldName: "dbname",
                type: "text",
                placeholder: "passaros_do_planeta",
                required: true
            }, {
                displayName: "Usuário do banco",
                fieldName: "user",
                type: "text",
                placeholder: "postgres",
                required: true
            }, {
                displayName: "Senha do banco",
                fieldName: "password",
                type: "password",
                placeholder: "*******"
            }, {
                displayName: "Utiliza conexão segura (SSL)?",
                fieldName: "ssl",
                type: "select",
                choices: [{
                    name: 'Sim',
                    value: true,
                    selectionAccent: 'active'
                }, {
                    name: 'Não',
                    value: false,
                    selectionAccent: 'danger'
                }]
            }]
        },
        mysql: {
            name: 'MySQL',
            fields: [{
                displayName: "Endereço",
                fieldName: "host",
                type: "text",
                placeholder: "localhost",
                placeholderIsDefault: true
            }, {
                displayName: "Porta",
                fieldName: "port",
                type: "text",
                transform: parseInt,
                placeholder: "3306",
                placeholderIsDefault: true
            }, {
                displayName: "Nome da base",
                fieldName: "dbname",
                type: "text",
                placeholder: "passaros_do_planeta",
                required: true
            }, {
                displayName: "Usuário do banco",
                fieldName: "user",
                type: "text",
                placeholder: "Qual o usuário que você usa para acessar o banco de dados?",
                required: true
            }, {
                displayName: "Senha do banco",
                fieldName: "password",
                type: "password",
                placeholder: "*******"
            }]
        },
        h2: {
            name: 'H2',
            fields: [{
                displayName: "String de conexão",
                fieldName: "db",
                type: "text",
                placeholder: "file:/Users/camsaul/bird_sightings/toucans;AUTO_SERVER=TRUE"
            }]
        },
        mongo: {
            name: 'MongoDB',
            fields: [{
                displayName: "Endereço",
                fieldName: "host",
                type: "text",
                placeholder: "localhost",
                placeholderIsDefault: true
            }, {
                displayName: "Porta",
                fieldName: "port",
                type: "text",
                transform: parseInt,
                placeholder: "27017",
                placeholderIsDefault: true
            }, {
                displayName: "Nome do banco",
                fieldName: "dbname",
                type: "text",
                placeholder: "entregasPomboCorreio",
                required: true
            }, {
                displayName: "Usuário do banco",
                fieldName: "user",
                type: "text",
                placeholder: "Qual o nome de usuário que você usa para acessar o banco de dados?"
            }, {
                displayName: "Senha do banco",
                fieldName: "pass",
                type: "password",
                placeholder: "******"
            }]
        }
    };

    // Prepare database details before being sent to the API.
    // This includes applying 'transform' functions and adding default values where applicable.
    this.prepareDatabaseDetails = function(details) {
        if (!details.engine) throw "Falta a chave 'motor' em detalhes da solicitação de banco de dados; por favor, adicione isto como a API espera no corpo da solicitação.";

        // iterate over each field definition
        this.ENGINES[details.engine].fields.forEach(function(field) {
            var fieldName = field.fieldName;

            // set default value if applicable
            if (!details[fieldName] && field.placeholderIsDefault) {
                details[fieldName] = field.placeholder;
            }

            // apply transformation function if applicable
            if (details[fieldName] && field.transform) {
                details[fieldName] = field.transform(details[fieldName]);
            }
        });

        return details;
    };

}).apply(exports);
