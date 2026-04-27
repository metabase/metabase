const FUNCTION_NAMES: WeakMap<object, string> = (() => {
  const map = new WeakMap<object, string>();
  const targets: Array<[object, string]> = [
    [window, "window"],
    [Window.prototype, "Window"],
    [EventTarget.prototype, "EventTarget"],
    [Node.prototype, "Node"],
    [Element.prototype, "Element"],
    [HTMLElement.prototype, "HTMLElement"],
    [Document.prototype, "Document"],
    [Navigator.prototype, "Navigator"],
    [Screen.prototype, "Screen"],
    [CanvasRenderingContext2D.prototype, "CanvasRenderingContext2D"],
    [HTMLCanvasElement.prototype, "HTMLCanvasElement"],
    [SVGElement.prototype, "SVGElement"],
    [Event.prototype, "Event"],
    [UIEvent.prototype, "UIEvent"],
    [MouseEvent.prototype, "MouseEvent"],
    [PointerEvent.prototype, "PointerEvent"],
    [WheelEvent.prototype, "WheelEvent"],
    [KeyboardEvent.prototype, "KeyboardEvent"],
    [TouchEvent.prototype, "TouchEvent"],
    [Touch.prototype, "Touch"],
    [CSSStyleDeclaration.prototype, "CSSStyleDeclaration"],
    [DOMRect.prototype, "DOMRect"],
    [DOMRectReadOnly.prototype, "DOMRectReadOnly"],
    [TextMetrics.prototype, "TextMetrics"],
    [ResizeObserverEntry.prototype, "ResizeObserverEntry"],
  ];

  for (const [owner, prefix] of targets) {
    for (const key of Object.getOwnPropertyNames(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor) {
        continue;
      }
      if (typeof descriptor.value === "function") {
        map.set(descriptor.value, `${prefix}.${key}`);
      }
      if (typeof descriptor.get === "function") {
        map.set(descriptor.get, `${prefix}.get ${key}`);
      }
    }
  }

  return map;
})();

export function getFunctionName(fn: object & { name?: string }): string {
  return FUNCTION_NAMES.get(fn) || fn?.name || "unknown";
}
