// NOTE: JSDOM does not implement the `scrollTo` method on elements
// so this function is used for mocking purposes in Jest
export function scrollTo(element: HTMLDivElement, options: ScrollToOptions) {
  element.scrollTo(options);
}
