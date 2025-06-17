export function getRootElement(): HTMLElement {
  return window["mb_root_element"] ?? document.body;
}
