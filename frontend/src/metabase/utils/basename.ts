let basename = "";

export function getBasename() {
  return basename;
}

export function setBasename(newBasename = "") {
  basename = newBasename.replace(/\/+$/, "");
}
