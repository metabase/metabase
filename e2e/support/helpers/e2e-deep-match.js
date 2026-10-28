export function isDeepMatch(objectOrValue, partialObjectOrValue) {
  if (isMatcher(partialObjectOrValue)) {
    return partialObjectOrValue(objectOrValue);
  }

  const bothAreNotObjects =
    // Check null because typeof null === "object"
    objectOrValue == null ||
    partialObjectOrValue == null ||
    typeof objectOrValue !== "object" ||
    typeof partialObjectOrValue !== "object";

  // Exit condition when calling recursively
  if (bothAreNotObjects) {
    return objectOrValue === partialObjectOrValue;
  }

  for (const [key, value] of Object.entries(partialObjectOrValue)) {
    if (Array.isArray(value)) {
      if (
        !Array.isArray(objectOrValue[key]) ||
        !isArrayDeepMatch(objectOrValue[key], value)
      ) {
        return false;
      }
    } else if (!isDeepMatch(objectOrValue[key], value)) {
      return false;
    }
  }

  return true;
}

function isMatcher(value) {
  return typeof value === "function";
}

function isArrayDeepMatch(array, partialArray) {
  for (const index in partialArray) {
    if (!isDeepMatch(array[index], partialArray[index])) {
      return false;
    }
  }

  return true;
}
