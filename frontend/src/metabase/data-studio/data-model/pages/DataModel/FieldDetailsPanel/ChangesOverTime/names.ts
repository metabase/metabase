export function singularName(name: string) {
  if (/ies$/i.test(name)) {
    return name.replace(/ies$/i, "y");
  }
  return name.replace(/s$/i, "");
}
