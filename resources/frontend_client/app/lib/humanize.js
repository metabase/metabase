
import inflection from "inflection";

export function stripId(name) {
    return name && name.replace(/ id$/i, "");
}

export function singularize(...args) {
    return inflection.singularize(...args);
}
