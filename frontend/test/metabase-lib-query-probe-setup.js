const PROBE_ERROR_PREFIX = "[metabase-lib-query-probe]";

function createThrowingFunction(moduleName, exportName) {
  return function metabaseLibProbeThrow() {
    throw new Error(
      `${PROBE_ERROR_PREFIX} ${moduleName}.${String(
        exportName,
      )} was called. This test still needs real metabase-lib query behavior.`,
    );
  };
}

function createThrowingModule(moduleName) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "__esModule") {
          return true;
        }

        if (property === "default") {
          return createThrowingFunction(moduleName, "default");
        }

        return createThrowingFunction(moduleName, property);
      },
    },
  );
}

function createTypeConstantsMock() {
  const typeValues = {
    "*": "type/*",
    Address: "type/Address",
    AvatarURL: "type/AvatarURL",
    BigInteger: "type/BigInteger",
    Boolean: "type/Boolean",
    Category: "type/Category",
    City: "type/City",
    Coordinate: "type/Coordinate",
    Country: "type/Country",
    Currency: "type/Currency",
    Date: "type/Date",
    DateTime: "type/DateTime",
    DateTimeWithLocalTZ: "type/DateTimeWithLocalTZ",
    DateTimeWithTZ: "type/DateTimeWithTZ",
    DateTimeWithZoneID: "type/DateTimeWithZoneID",
    DateTimeWithZoneOffset: "type/DateTimeWithZoneOffset",
    Decimal: "type/Decimal",
    Description: "type/Description",
    Email: "type/Email",
    FK: "type/FK",
    Float: "type/Float",
    IPAddress: "type/IPAddress",
    ImageURL: "type/ImageURL",
    Instant: "type/Instant",
    Integer: "type/Integer",
    Latitude: "type/Latitude",
    Longitude: "type/Longitude",
    Name: "type/Name",
    Number: "type/Number",
    PK: "type/PK",
    Percentage: "type/Percentage",
    Product: "type/Product",
    Quantity: "type/Quantity",
    Score: "type/Score",
    Source: "type/Source",
    State: "type/State",
    Text: "type/Text",
    TextLike: "type/TextLike",
    Time: "type/Time",
    Title: "type/Title",
    URL: "type/URL",
    UUID: "type/UUID",
    ZipCode: "type/ZipCode",
  };

  const TYPE = new Proxy(typeValues, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }

      return `type/${String(property)}`;
    },
  });

  const TEMPORAL = "TEMPORAL";
  const NUMBER = "NUMBER";
  const INTEGER = "INTEGER";
  const STRING = "STRING";
  const STRING_LIKE = "STRING_LIKE";
  const BOOLEAN = "BOOLEAN";
  const LOCATION = "LOCATION";
  const COORDINATE = "COORDINATE";
  const FOREIGN_KEY = "FOREIGN_KEY";
  const PRIMARY_KEY = "PRIMARY_KEY";
  const SUMMABLE = "SUMMABLE";
  const SCOPE = "SCOPE";
  const CATEGORY = "CATEGORY";
  const UNKNOWN = "UNKNOWN";

  return {
    __esModule: true,
    BOOLEAN,
    CATEGORY,
    COORDINATE,
    FOREIGN_KEY,
    INTEGER,
    LEVEL_ONE_TYPES: [
      TYPE.Boolean,
      TYPE.Number,
      TYPE.TextLike,
      TYPE.Temporal,
      TYPE.Relation,
    ],
    LOCATION,
    NUMBER,
    PRIMARY_KEY,
    SCOPE,
    STRING,
    STRING_LIKE,
    SUMMABLE,
    TEMPORAL,
    TYPE,
    TYPE_HIERARCHIES: {
      [TEMPORAL]: {
        base_type: [TYPE.Temporal],
        effective_type: [TYPE.Temporal],
      },
      [NUMBER]: { base_type: [TYPE.Number], effective_type: [TYPE.Number] },
      [INTEGER]: { base_type: [TYPE.Integer], effective_type: [TYPE.Integer] },
      [STRING]: { base_type: [TYPE.Text], effective_type: [TYPE.Text] },
      [STRING_LIKE]: {
        base_type: [TYPE.TextLike],
        effective_type: [TYPE.TextLike],
      },
      [BOOLEAN]: { base_type: [TYPE.Boolean], effective_type: [TYPE.Boolean] },
      [COORDINATE]: { semantic_type: [TYPE.Coordinate] },
      [LOCATION]: { semantic_type: [TYPE.Address] },
      [FOREIGN_KEY]: { semantic_type: [TYPE.FK] },
      [PRIMARY_KEY]: { semantic_type: [TYPE.PK] },
      [SUMMABLE]: { include: [NUMBER], exclude: [LOCATION, TEMPORAL] },
      [SCOPE]: { include: [NUMBER, TEMPORAL, CATEGORY, STRING] },
      [CATEGORY]: { semantic_type: [TYPE.Category] },
    },
    UNKNOWN,
  };
}

function createIsaMock() {
  const constants = createTypeConstantsMock();
  const { TYPE, TYPE_HIERARCHIES } = constants;

  const parents = new Map(
    Object.entries({
      [TYPE.Address]: [TYPE.Text],
      [TYPE.AvatarURL]: [TYPE.URL],
      [TYPE.BigInteger]: [TYPE.Integer],
      [TYPE.Category]: [TYPE.Text],
      [TYPE.City]: [TYPE.Address],
      [TYPE.Coordinate]: ["Semantic/*"],
      [TYPE.Country]: [TYPE.Address],
      [TYPE.Currency]: [TYPE.Decimal],
      [TYPE.Date]: [TYPE.Temporal],
      [TYPE.DateTime]: [TYPE.Date, TYPE.Time],
      [TYPE.DateTimeWithLocalTZ]: [TYPE.DateTimeWithTZ],
      [TYPE.DateTimeWithTZ]: [TYPE.DateTime],
      [TYPE.DateTimeWithZoneID]: [TYPE.DateTimeWithTZ],
      [TYPE.DateTimeWithZoneOffset]: [TYPE.DateTimeWithTZ],
      [TYPE.Decimal]: [TYPE.Number],
      [TYPE.Description]: [TYPE.Text],
      [TYPE.Email]: [TYPE.Text],
      [TYPE.FK]: ["Relation/*"],
      [TYPE.Float]: [TYPE.Number],
      [TYPE.IPAddress]: [TYPE.TextLike],
      [TYPE.ImageURL]: [TYPE.URL],
      [TYPE.Instant]: [TYPE.DateTimeWithLocalTZ],
      [TYPE.Integer]: [TYPE.Number],
      [TYPE.Latitude]: [TYPE.Coordinate],
      [TYPE.Longitude]: [TYPE.Coordinate],
      [TYPE.Name]: [TYPE.Text],
      [TYPE.Number]: [TYPE["*"]],
      [TYPE.PK]: ["Relation/*"],
      [TYPE.Percentage]: [TYPE.Number],
      [TYPE.Product]: [TYPE.Text],
      [TYPE.Quantity]: [TYPE.Number],
      [TYPE.Score]: [TYPE.Number],
      [TYPE.Source]: [TYPE.Text],
      [TYPE.State]: [TYPE.Address],
      [TYPE.Text]: [TYPE.TextLike],
      [TYPE.TextLike]: [TYPE["*"]],
      [TYPE.Time]: [TYPE.Temporal],
      [TYPE.Title]: [TYPE.Name],
      [TYPE.URL]: [TYPE.Text],
      [TYPE.UUID]: [TYPE.TextLike],
      [TYPE.ZipCode]: [TYPE.Address],
      [TYPE.Boolean]: [TYPE["*"]],
      [TYPE.Temporal]: [TYPE["*"]],
    }),
  );

  function isa(type, expectedType) {
    if (type == null || expectedType == null) {
      return false;
    }

    if (type === expectedType) {
      return true;
    }

    const visited = new Set();
    const queue = [...(parents.get(type) || [])];

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === expectedType) {
        return true;
      }

      if (!visited.has(current)) {
        visited.add(current);
        queue.push(...(parents.get(current) || []));
      }
    }

    return false;
  }

  function isFieldType(type, field) {
    if (!field) {
      return false;
    }

    const typeDefinition = TYPE_HIERARCHIES[type];
    if (!typeDefinition) {
      return false;
    }

    const props = field.effective_type
      ? ["effective_type", "semantic_type"]
      : ["base_type", "semantic_type"];

    for (const prop of props) {
      const fieldType = field[prop];
      const allowedTypes = typeDefinition[prop] || [];

      if (allowedTypes.some((allowedType) => isa(fieldType, allowedType))) {
        return true;
      }
    }

    if (
      (typeDefinition.exclude || []).some((item) => isFieldType(item, field))
    ) {
      return false;
    }

    return (typeDefinition.include || []).some((item) =>
      isFieldType(item, field),
    );
  }

  const isTypePK = (type) => isa(type, TYPE.PK);
  const isTypeFK = (type) => isa(type, TYPE.FK);
  const isTypeCurrency = (type) => isa(type, TYPE.Currency);
  const isDate = (field) => isFieldType(constants.TEMPORAL, field);
  const isNumeric = (field) => isFieldType(constants.NUMBER, field);
  const isInteger = (field) => isFieldType(constants.INTEGER, field);
  const isBoolean = (field) => isFieldType(constants.BOOLEAN, field);
  const isString = (field) => isFieldType(constants.STRING, field);
  const isStringLike = (field) => isFieldType(constants.STRING_LIKE, field);
  const isSummable = (field) => isFieldType(constants.SUMMABLE, field);
  const hasNonMetricName = (column) => {
    const name = String(column?.name || "").toLowerCase();
    return name === "id" || name.endsWith("_id") || name.endsWith("-id");
  };

  return {
    __esModule: true,
    getFieldType(field) {
      const types = [
        constants.TEMPORAL,
        constants.LOCATION,
        constants.COORDINATE,
        constants.FOREIGN_KEY,
        constants.PRIMARY_KEY,
        constants.BOOLEAN,
        constants.STRING,
        constants.STRING_LIKE,
        constants.NUMBER,
      ];

      return types.find((type) => isFieldType(type, field));
    },
    getIsPKFromTablePredicate: (tableId) => (column) =>
      isTypePK(column?.semantic_type) &&
      (tableId == null || column?.table_id === tableId),
    hasLatitudeAndLongitudeColumns(columns) {
      return (
        columns.some((column) => isa(column?.semantic_type, TYPE.Latitude)) &&
        columns.some((column) => isa(column?.semantic_type, TYPE.Longitude))
      );
    },
    isa,
    isAddress: (field) => !!field && isa(field.semantic_type, TYPE.Address),
    isAny: () => true,
    isAvatarURL: (field) => !!field && isa(field.semantic_type, TYPE.AvatarURL),
    isBoolean,
    isCategory: (field) => !!field && isa(field.semantic_type, TYPE.Category),
    isCoordinate: (field) =>
      !!field && isa(field.semantic_type, TYPE.Coordinate),
    isCountry: (field) => !!field && isa(field.semantic_type, TYPE.Country),
    isCurrency: (field) => !!field && isa(field.semantic_type, TYPE.Currency),
    isDate,
    isDateWithoutTime: (field) =>
      !!field &&
      (isa(field.effective_type, TYPE.Date) || isa(field.base_type, TYPE.Date)),
    isDimension: (column) =>
      column?.source !== "aggregation" || !!column?.binning_info,
    isEmail: (field) => !!field && isa(field.semantic_type, TYPE.Email),
    isEntityName: (field) => !!field && isa(field.semantic_type, TYPE.Name),
    isFK: (field) => !!field && isTypeFK(field.semantic_type),
    isFieldType,
    isFloat: (field) => !!field && isa(field.semantic_type, TYPE.Float),
    isID: (field) =>
      !!field &&
      (isTypeFK(field.semantic_type) || isTypePK(field.semantic_type)),
    isImageURL: (field) => !!field && isa(field.semantic_type, TYPE.ImageURL),
    isInteger,
    isLatitude: (field) => !!field && isa(field.semantic_type, TYPE.Latitude),
    isLongitude: (field) => !!field && isa(field.semantic_type, TYPE.Longitude),
    isMetric: (column) =>
      column?.source !== "breakout" &&
      isSummable(column) &&
      !hasNonMetricName(column) &&
      !column?.binning_info,
    isNumber: (field) =>
      !!field &&
      (isa(field.effective_type, TYPE.Number) ||
        isa(field.base_type, TYPE.Number)) &&
      (field.semantic_type == null ||
        isa(field.semantic_type, TYPE.Number) ||
        isa(field.semantic_type, TYPE.Category)),
    isNumeric,
    isNumericBaseType: (field) =>
      !!field &&
      (isa(field.effective_type, TYPE.Number) ||
        isa(field.base_type, TYPE.Number)),
    isPK: (field) => !!field && isTypePK(field.semantic_type),
    isPercentage: (field) =>
      !!field && isa(field.semantic_type, TYPE.Percentage),
    isProduct: (field) => !!field && isa(field.semantic_type, TYPE.Product),
    isQuantity: (field) => !!field && isa(field.semantic_type, TYPE.Quantity),
    isScore: (field) => !!field && isa(field.semantic_type, TYPE.Score),
    isSource: (field) => !!field && isa(field.semantic_type, TYPE.Source),
    isState: (field) => !!field && isa(field.semantic_type, TYPE.State),
    isString,
    isStringLike,
    isSummable,
    isTime: (field) =>
      !!field &&
      (isa(field.effective_type, TYPE.Time) || isa(field.base_type, TYPE.Time)),
    isTitle: (field) => !!field && isa(field.semantic_type, TYPE.Title),
    isTypeCurrency,
    isTypeFK,
    isTypePK,
    isURL: (field) => !!field && isa(field.semantic_type, TYPE.URL),
  };
}

function createParameterOperatorsMock() {
  const operators = {
    "=": { name: "=", operator: "=", multi: true, numFields: 1 },
    "!=": { name: "!=", operator: "!=", multi: true, numFields: 1 },
    between: {
      name: "between",
      operator: "between",
      multi: false,
      numFields: 2,
    },
    contains: {
      name: "contains",
      operator: "contains",
      multi: true,
      numFields: 1,
    },
    "does-not-contain": {
      name: "does-not-contain",
      operator: "does-not-contain",
      multi: true,
      numFields: 1,
    },
    "ends-with": {
      name: "ends-with",
      operator: "ends-with",
      multi: true,
      numFields: 1,
    },
    "is-empty": {
      name: "is-empty",
      operator: "is-empty",
      multi: false,
      numFields: 0,
    },
    "is-null": {
      name: "is-null",
      operator: "is-null",
      multi: false,
      numFields: 0,
    },
    "not-empty": {
      name: "not-empty",
      operator: "not-empty",
      multi: false,
      numFields: 0,
    },
    "not-null": {
      name: "not-null",
      operator: "not-null",
      multi: false,
      numFields: 0,
    },
    "starts-with": {
      name: "starts-with",
      operator: "starts-with",
      multi: true,
      numFields: 1,
    },
  };

  return {
    __esModule: true,
    buildTypedOperatorOptions(operatorType, sectionId, sectionName) {
      return Object.values(operators).map((operator) => ({
        ...operator,
        sectionId,
        combinedName: sectionName
          ? `${sectionName} ${operator.name}`
          : operator.name,
        type: operatorType,
      }));
    },
    deriveFieldOperatorFromParameter(parameter) {
      const name = parameter?.type?.split("/")?.[1] || "=";
      return operators[name] || operators["="];
    },
    getNumberParameterArity(parameter) {
      return parameter?.type === "number/between" ? 2 : 1;
    },
    getOperatorDisplayName(option, _operatorType, sectionName) {
      return option?.name || sectionName;
    },
    getParameterOperatorName(name) {
      return operators[name] ? name : "=";
    },
  };
}

function createParameterValuesMock() {
  const PULSE_PARAM_EMPTY = null;
  const PULSE_PARAM_USE_DEFAULT = undefined;

  function getParameterValue({
    parameter,
    values = {},
    defaultRequired = false,
    lastUsedParameterValue = null,
  }) {
    const value = values?.[parameter.id];
    const useDefault = defaultRequired && parameter.required;

    return (
      lastUsedParameterValue ?? value ?? (useDefault ? parameter.default : null)
    );
  }

  function isParameterValueEmpty(value) {
    return (
      value === PULSE_PARAM_EMPTY ||
      (Array.isArray(value) && value.length === 0) ||
      value === ""
    );
  }

  function getParameterType(type) {
    return type?.split("/")?.[0] || type;
  }

  function normalizeParameterValue(type, value) {
    const fieldType = getParameterType(type);

    if (value === PULSE_PARAM_USE_DEFAULT) {
      return PULSE_PARAM_USE_DEFAULT;
    } else if (isParameterValueEmpty(value)) {
      return PULSE_PARAM_EMPTY;
    } else if (["string", "number"].includes(fieldType)) {
      return [].concat(value);
    } else {
      return value;
    }
  }

  return {
    __esModule: true,
    PULSE_PARAM_EMPTY,
    PULSE_PARAM_USE_DEFAULT,
    areParameterValuesIdentical(left, right) {
      const normalize = (value) =>
        Array.isArray(value) ? value.slice().sort() : value;

      return (
        JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
      );
    },
    getDefaultValuePopulatedParameters(parameters, parameterValues) {
      return parameters.map((parameter) => {
        const value = parameterValues?.[parameter.id];

        return {
          ...parameter,
          value: value === PULSE_PARAM_USE_DEFAULT ? parameter.default : value,
        };
      });
    },
    getIsMultiSelect(parameter) {
      return parameter.isMultiSelect ?? !parameter.hasVariableTemplateTagTarget;
    },
    getParameterValue,
    getParameterValuesBySlug(parameters = [], parameterValuesById = {}) {
      return Object.fromEntries(
        parameters.map((parameter) => [
          parameter.slug,
          parameter.value ?? parameterValuesById[parameter.id] ?? null,
        ]),
      );
    },
    getValuePopulatedParameters({
      parameters,
      values = {},
      defaultRequired = false,
      collectionPreview = false,
    }) {
      if (collectionPreview) {
        return [];
      }

      return parameters.map((parameter) => ({
        ...parameter,
        value: getParameterValue({
          parameter,
          values,
          defaultRequired,
        }),
      }));
    },
    hasValue(value) {
      return Array.isArray(value) ? value.length > 0 : value != null;
    },
    isParameterValueEmpty,
    normalizeParameter(parameter) {
      return {
        id: parameter.id,
        name: parameter.name,
        slug: parameter.slug,
        type: parameter.type,
        target: parameter.target,
        options: parameter.options,
        values_query_type: parameter.values_query_type,
        values_source_config: parameter.values_source_config,
        values_source_type: parameter.values_source_type,
      };
    },
    normalizeParameterValue,
    normalizeParameters(parameters) {
      return parameters
        .filter((parameter) => Object.hasOwn(parameter, "value"))
        .map(({ id, type, value, target, options }) => ({
          id,
          type,
          value: normalizeParameterValue(type, value),
          target,
          options,
        }));
    },
    parameterHasNoDisplayValue(value) {
      return (
        (!value && value !== 0) ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    },
  };
}

jest.doMock("metabase-lib", () => createThrowingModule("metabase-lib"));
jest.doMock("metabase-lib/v1/Question", () =>
  createThrowingModule("metabase-lib/v1/Question"),
);
jest.doMock("metabase-lib/v1/types/constants", () => createTypeConstantsMock());
jest.doMock("metabase-lib/v1/types/utils/isa", () => createIsaMock());
jest.doMock("metabase-lib/v1/parameters/utils/parameter-values", () =>
  createParameterValuesMock(),
);
jest.doMock("metabase-lib/v1/parameters/utils/operators", () =>
  createParameterOperatorsMock(),
);
