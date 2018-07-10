const j = require("jscodeshift");

function getPropertyName(path) {
  const parent = path.parentPath.value;
  if (parent.type === "Property") {
    if (parent.key.type === "Identifier") {
      return parent.key.name;
    } else if (parent.key.type === "Literal") {
      return parent.key.value;
    }
  }
  if (parent.type === "JSXAttribute") {
    return parent.name.name;
  }
}

function splitMatches(string, regex) {
  const results = [];
  let current = 0;
  string.replace(regex, (match, index) => {
    results.push(string.slice(current, index));
    results.push(match);
    current = index + match.length;
  });
  results.push(string.slice(current));
  return results;
}

function extractMatches(
  string,
  regex,
  replacer = str => j.stringLiteral(str),
  quasis = [],
  expressions = [],
) {
  const components = splitMatches(string, regex);
  for (let cIndex = 0; cIndex < components.length; cIndex++) {
    if (cIndex % 2) {
      expressions.push(replacer(components[cIndex]));
    } else {
      const quasi = j.templateElement(
        { cooked: components[cIndex], raw: components[cIndex] },
        false,
      );
      quasis.push(quasi);
    }
  }
  return components.length > 1;
}

function makeTemplate(quasis, expressions) {
  if (
    quasis.length === 2 &&
    quasis[0].value.raw === "" &&
    quasis[1].value.raw === ""
  ) {
    return expressions[0];
  } else {
    return j.templateLiteral(quasis, expressions);
  }
}

exports.replaceStrings = function replaceStrings(source, regex, replacer) {
  const root = j(source, { parser: require("flow-parser") });
  root
    .find(j.Literal)
    .filter(
      path =>
        // match only string literals
        typeof path.value.value === "string" &&
        // don't match strings that are property keys
        !(
          path.parentPath.value.type && path.parentPath.value.key == path.value
        ),
    )
    .replaceWith(path => {
      const stringValue = path.value.value;
      const propertyName = getPropertyName(path);

      const quasis = [];
      const expressions = [];
      if (
        extractMatches(
          stringValue,
          regex,
          str => replacer(str, propertyName),
          quasis,
          expressions,
        )
      ) {
        const value = makeTemplate(quasis, expressions);
        // wrap non string literals in JSXExpressionContainer
        if (
          path.parentPath.value.type === "JSXAttribute" &&
          (value.type !== "Literal" || typeof value.value !== "string")
        ) {
          return j.jsxExpressionContainer(value);
        } else {
          return value;
        }
      } else {
        return path.value;
      }
    });
  root
    .find(j.TemplateLiteral)
    // .filter(path => typeof path.value.value.raw === "string")
    .replaceWith(path => {
      const propertyName = getPropertyName(path);

      let modified = false;
      const quasis = [];
      const expressions = [];

      for (let qIndex = 0; qIndex < path.value.quasis.length; qIndex++) {
        const quasiValue = path.value.quasis[qIndex].value.raw;
        if (
          extractMatches(
            quasiValue,
            regex,
            str => replacer(str, propertyName),
            quasis,
            expressions,
          )
        ) {
          modified = true;
        }
        if (qIndex < path.value.expressions.length) {
          expressions.push(path.value.expressions[qIndex]);
        }
      }

      if (modified) {
        return makeTemplate(quasis, expressions);
      } else {
        return path.value;
      }
    });
  return root.toSource();
};
