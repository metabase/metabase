let basename = "";

export function getBasename() {
  return basename;
}

export function setBasename(newBasename?: string | null) {
  basename = (newBasename ?? "").replace(/\/+$/, "");
}
