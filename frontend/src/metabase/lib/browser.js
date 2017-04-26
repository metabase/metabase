
import querystring from "querystring";

export function parseHashOptions(hash) {
    let options = querystring.parse(hash.replace(/^#/, ""));
    for (var name in options) {
        if (options[name] === "") {
            options[name] = true;
        } else if (/^(true|false|-?\d+(\.\d+)?)$/.test(options[name])) {
            options[name] = JSON.parse(options[name]);
        }
    }
    return options;
}

export function stringifyHashOptions(options) {
    return querystring.stringify(options).replace(/=true\b/g, "");
}
