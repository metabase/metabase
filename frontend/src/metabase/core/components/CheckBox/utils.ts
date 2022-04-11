export function isEllipsisActive(node: HTMLElement): boolean {
  return node.offsetWidth < node.scrollWidth;
}
