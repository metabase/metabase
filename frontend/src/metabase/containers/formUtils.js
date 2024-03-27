import { getIn } from "icepick";

// returns a function that takes an object
// apply the top level method (if any) to the whole object
// then apply each field's method (if any) to each value in object, setting the result if not undefined
//
// equivalent examples:
//
// form.initial is { foo: "bar" }
// form.initial is () => ({ foo: "bar" })
// form.fields[0] is { name: "foo", initial: "bar" }
// form.fields[0] is { name: "foo", initial: () => "bar" }

function makeFormMethod(form, methodName, defaultValues = {}, mergeFn) {
  const originalMethod = form[methodName];
  form[methodName] = (object, ...args) => {
    // make a copy
    const values = {
      ...(getValue(originalMethod, object, ...args) ||
        getValue(defaultValues, object, ...args)),
    };
    for (const field of form.fields(object)) {
      const value = getValue(
        field[methodName],
        object && getValueAtPath(object, field.name),
        ...args,
      );
      if (value !== undefined) {
        setValueAtPath(values, field.name, value, mergeFn);
      }
    }
    return values;
  };
}

// if the first arg is a function, call it, otherwise return it.
export function getValue(fnOrValue, ...args) {
  return typeof fnOrValue === "function" ? fnOrValue(...args) : fnOrValue;
}

export function makeFormObject(formDef) {
  const form = {
    ...formDef,
    fields: values => getValue(formDef.fields, values),
    fieldNames: values => [
      "id",
      ...form.fields(values).map(field => field.name),
    ],
  };

  // for validating the object, or individual values
  makeFormMethod(form, "validate", {}, (a, b) =>
    [a, b].filter(a => a).join(", "),
  );

  // for getting the initial values object, or getting individual values
  makeFormMethod(form, "initial");

  // for normalizing the object before submitting, or normalizeing individual values
  makeFormMethod(form, "normalize", object => object);
  makeFormMethod(form, "hidden");

  return form;
}

function getObjectPath(path) {
  return typeof path === "string" ? path.split(".") : path;
}

function getValueAtPath(object, path) {
  return getIn(object, getObjectPath(path));
}

function setValueAtPath(object, path, value, mergeFn = (a, b) => b) {
  path = getObjectPath(path);
  for (let i = 0; i < path.length; i++) {
    if (i === path.length - 1) {
      object[path[i]] = mergeFn(object[path[i]], value);
    } else {
      object = object[path[i]] = object[path[i]] || {};
    }
  }
}

export function cleanObject(object) {
  const result = {};
  Object.keys(object).forEach(key => {
    const isNestedObject = typeof object[key] === "object";
    if (isNestedObject) {
      const cleanNestedObject = cleanObject(object[key]);
      if (Object.keys(cleanNestedObject).length > 0) {
        result[key] = cleanNestedObject;
      }
    } else {
      const value = object[key];
      if (value) {
        result[key] = value;
      }
    }
  });
  return result;
}

export function isNestedFieldName(name) {
  return name.includes(".");
}

export function getMaybeNestedValue(obj, fieldName) {
  return isNestedFieldName(fieldName)
    ? getIn(obj, fieldName.split("."))
    : obj[fieldName];
}
